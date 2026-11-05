import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EventStatus, Prisma } from "@prisma/client";
import {
  DEFAULT_CHECKLISTS,
  DEFAULT_MODULES,
  EVENT_STATUSES,
  EVENT_TYPES,
  createEventSchema,
} from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import {
  canManageEvent,
  findEvent,
  isStaff,
  requireEventManager,
  requireStaff,
  roleOf,
} from "../lib/permissions";
import { slugify } from "../lib/codes";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { canTransition, runCompletionAutomation } from "../lib/lifecycle";
import { computeLeaderboard, defaultRoundId } from "../lib/judging";

const HIDDEN_FROM_PUBLIC: EventStatus[] = ["DRAFT", "PLANNING"];
const DAY = 24 * 60 * 60 * 1000;

const DEFAULT_RUBRIC = [
  { name: "Innovation", description: "Originality and creativity of the idea", maxScore: 10, weight: 1.5 },
  { name: "Technical execution", description: "Quality and completeness of the build", maxScore: 10, weight: 1.5 },
  { name: "Impact", description: "Usefulness and potential real-world impact", maxScore: 10, weight: 1 },
  { name: "Presentation", description: "Clarity of the demo and pitch", maxScore: 10, weight: 1 },
];

const updateEventSchema = createEventSchema
  .omit({ type: true })
  .partial()
  .extend({
    driveFolderUrl: z.string().url().nullable().optional(),
    registrationForm: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: z.enum(["text", "textarea", "select", "checkbox", "url", "number"]),
          required: z.boolean().default(false),
          options: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    meetingUrl: z.string().url().nullable().optional(),
  });

async function uniqueSlug(tenantId: string, title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; await prisma.event.findUnique({ where: { tenantId_slug: { tenantId, slug } } }); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

async function validateCampuses(tenantId: string, campusIds: string[]) {
  if (!campusIds.length) return;
  const found = await prisma.campus.count({ where: { tenantId, id: { in: campusIds } } });
  if (found !== new Set(campusIds).size) throw badRequest("One or more campuses don't belong to this brand");
}

export function eventRoutes(app: FastifyInstance) {
  app.get("/events", async (req, reply) => {
    const tenant = requireTenant(req);
    const q = z
      .object({
        status: z.enum(EVENT_STATUSES).optional(),
        type: z.enum(EVENT_TYPES).optional(),
        campusId: z.string().optional(),
        upcoming: z.coerce.boolean().optional(),
        past: z.coerce.boolean().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);

    const staff = isStaff(req);
    const where: Prisma.EventWhereInput = {
      tenantId: tenant.id,
      ...(q.type && { type: q.type }),
      ...(q.campusId && { OR: [{ scope: "CENTRAL" }, { campuses: { some: { campusId: q.campusId } } }] }),
      ...(q.upcoming && { endsAt: { gte: new Date() } }),
      ...(q.past && { endsAt: { lt: new Date() } }),
      ...(q.search && { title: { contains: q.search, mode: "insensitive" } }),
    };
    if (q.status) {
      if (!staff && HIDDEN_FROM_PUBLIC.includes(q.status)) return [];
      where.status = q.status;
    } else if (!staff) {
      where.status = { notIn: HIDDEN_FROM_PUBLIC };
    }

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { startsAt: q.past ? "desc" : "asc" },
        take: q.limit,
        skip: q.offset,
        include: {
          campuses: { include: { campus: { select: { id: true, name: true, code: true } } } },
          _count: { select: { registrations: true, teams: true } },
        },
      }),
      prisma.event.count({ where }),
    ]);
    reply.header("X-Total-Count", String(total));
    return items.map((e) => ({ ...e, outcome: undefined, campuses: e.campuses.map((c) => ({ campus: c.campus })) }));
  });

  app.get<{ Params: { idOrSlug: string } }>("/events/:idOrSlug", async (req) => {
    const base = await findEvent(req, req.params.idOrSlug);
    const manager = await canManageEvent(req, base);
    if (!manager && HIDDEN_FROM_PUBLIC.includes(base.status)) throw notFound("Event");

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        campuses: { include: { campus: { select: { id: true, name: true, code: true, city: true } } } },
        sessions: { orderBy: { startsAt: "asc" } },
        guests: manager
          ? { orderBy: { createdAt: "asc" } }
          : {
              where: { status: { in: ["CONFIRMED", "ARRIVED", "THANKED"] } },
              select: { id: true, name: true, designation: true, organization: true, bio: true, photoUrl: true, linkedinUrl: true, role: true },
            },
        rubric: { orderBy: { sortOrder: "asc" } },
        _count: { select: { registrations: true, teams: true } },
      },
    });

    let myRegistration = null;
    let myTeam = null;
    if (req.auth) {
      myRegistration = await prisma.registration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: req.auth.user.id } },
      });
      const tm = await prisma.teamMember.findFirst({
        where: { userId: req.auth.user.id, team: { eventId: event.id } },
        include: { team: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } } },
      });
      myTeam = tm?.team ?? null;
    }

    return {
      ...event,
      outcome: manager ? event.outcome : undefined,
      campuses: event.campuses.map((c) => ({ campus: c.campus })),
      canManage: manager,
      myRegistration,
      myTeam,
    };
  });

  app.post("/events", async (req, reply) => {
    const auth = requireStaff(req);
    const tenant = requireTenant(req);
    const input = createEventSchema.parse(req.body);
    if (input.endsAt < input.startsAt) throw badRequest("endsAt must be after startsAt");

    // Campus admins can only create events for their own campus.
    if (roleOf(req) === "CAMPUS_ADMIN" && !auth.user.isPlatformAdmin) {
      const own = auth.membership?.campusId;
      if (!own) throw forbidden("Your account isn't linked to a campus");
      input.scope = "CAMPUS";
      input.campusIds = [own];
    }
    if (input.scope === "CAMPUS" && !input.campusIds.length) throw badRequest("Pick at least one campus for a campus-level event");
    await validateCampuses(tenant.id, input.campusIds);

    const modules = { ...DEFAULT_MODULES[input.type], ...(input.modules ?? {}) };
    const templates = await prisma.taskTemplate.findMany({
      where: { tenantId: tenant.id, eventType: input.type },
      orderBy: { sortOrder: "asc" },
    });
    const checklist = templates.length ? templates : DEFAULT_CHECKLISTS[input.type];
    const isCompetition = input.type === "HACKATHON" || input.type === "COMPETITION";
    const config = {
      ...(isCompetition ? { minTeamSize: 2, maxTeamSize: 4, tracks: [] } : {}),
      ...(input.config ?? {}),
    };

    const { campusIds, ...fields } = input;
    const event = await prisma.event.create({
      data: {
        ...fields,
        modules,
        config: config as Prisma.InputJsonValue,
        tenantId: tenant.id,
        slug: await uniqueSlug(tenant.id, input.title),
        createdById: auth.user.id,
        campuses: { create: campusIds.map((campusId) => ({ campusId })) },
        staff: { create: [{ userId: auth.user.id, role: "MANAGER" }] },
        tasks: {
          create: checklist.map((t, i) => ({
            phase: t.phase,
            title: t.title,
            sortOrder: i,
            dueAt: new Date(input.startsAt.getTime() + t.dueOffsetDays * DAY),
          })),
        },
        ...(isCompetition && {
          rubric: { create: DEFAULT_RUBRIC.map((c, i) => ({ ...c, sortOrder: i })) },
          rounds: { create: [{ name: "Final", sortOrder: 0, isOpen: false }] },
        }),
      },
    });
    await logActivity(event.id, auth.user.id, "event.created", { title: event.title, type: event.type });
    return reply.status(201).send(event);
  });

  app.patch<{ Params: { id: string } }>("/events/:id", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const input = updateEventSchema.parse(req.body);
    const { campusIds, modules, config, registrationForm, ...fields } = input;
    if (campusIds) await validateCampuses(event.tenantId, campusIds);

    const startsAt = fields.startsAt ?? event.startsAt;
    const endsAt = fields.endsAt ?? event.endsAt;
    if (endsAt < startsAt) throw badRequest("endsAt must be after startsAt");

    const updated = await prisma.$transaction(async (tx) => {
      if (campusIds) {
        await tx.eventCampus.deleteMany({ where: { eventId: event.id } });
        await tx.eventCampus.createMany({ data: campusIds.map((campusId) => ({ eventId: event.id, campusId })) });
      }
      return tx.event.update({
        where: { id: event.id },
        data: {
          ...fields,
          ...(modules && { modules: { ...(event.modules as object), ...modules } }),
          ...(config && { config: { ...(event.config as object), ...config } as Prisma.InputJsonValue }),
          ...(registrationForm && { registrationForm }),
        },
      });
    });
    await logActivity(event.id, req.auth!.user.id, "event.updated", { fields: Object.keys(input) });
    return updated;
  });

  app.post<{ Params: { id: string } }>("/events/:id/status", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { status } = z.object({ status: z.enum(EVENT_STATUSES) }).parse(req.body);
    if (!canTransition(event.status, status)) {
      throw badRequest(`Can't move an event from ${event.status} to ${status}`);
    }
    const updated = await prisma.event.update({ where: { id: event.id }, data: { status } });
    await logActivity(event.id, req.auth!.user.id, "status.changed", { from: event.status, to: status });
    if (status === "COMPLETED") runCompletionAutomation(event.id, req.log);
    return updated;
  });

  app.get<{ Params: { id: string } }>("/events/:id/dashboard", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const eventId = event.id;
    const now = new Date();

    const [regs, tasks, overdue, teams, submitted, guests, media, social, certs, linkedin, feedback, activity, judges, rounds, expenses] =
      await Promise.all([
        prisma.registration.groupBy({ by: ["status"], where: { eventId }, _count: true }),
        prisma.eventTask.groupBy({ by: ["phase", "status"], where: { eventId }, _count: true }),
        prisma.eventTask.findMany({
          where: { eventId, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { lt: now } },
          orderBy: { dueAt: "asc" },
          take: 10,
          include: { assignee: { select: { id: true, name: true } } },
        }),
        prisma.team.count({ where: { eventId } }),
        prisma.team.count({ where: { eventId, submittedAt: { not: null } } }),
        prisma.eventGuest.groupBy({ by: ["status"], where: { eventId }, _count: true }),
        prisma.mediaAsset.groupBy({ by: ["kind"], where: { eventId }, _count: true }),
        prisma.socialPost.groupBy({ by: ["platform", "status"], where: { eventId }, _count: true }),
        prisma.certificate.groupBy({ by: ["type"], where: { eventId, revokedAt: null }, _count: true }),
        prisma.linkedInPost.groupBy({ by: ["status"], where: { eventId }, _count: true }),
        prisma.feedback.aggregate({ where: { eventId }, _avg: { rating: true }, _count: true }),
        prisma.eventActivity.findMany({
          where: { eventId },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { actor: { select: { id: true, name: true } } },
        }),
        prisma.judgeAssignment.findMany({ where: { eventId }, distinct: ["userId"], select: { userId: true } }),
        prisma.judgingRound.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
        prisma.expense.aggregate({ where: { eventId }, _sum: { planned: true, actual: true } }),
      ]);

    // Judging progress: submitted (team, judge) pairs vs. expected pairs in the default round.
    const roundId = await defaultRoundId(eventId);
    let judging = null;
    if (roundId) {
      const [submittedPairs, assignments] = await Promise.all([
        prisma.score.groupBy({ by: ["teamId", "judgeId"], where: { roundId, submittedAt: { not: null } } }),
        prisma.judgeAssignment.findMany({ where: { eventId, OR: [{ roundId }, { roundId: null }] } }),
      ]);
      const expected = new Set<string>();
      const allTeams = await prisma.team.findMany({ where: { eventId }, select: { id: true } });
      for (const a of assignments) {
        const targets = a.teamId ? [a.teamId] : allTeams.map((t) => t.id);
        for (const t of targets) expected.add(`${t}:${a.userId}`);
      }
      judging = {
        roundId,
        rounds,
        judges: judges.length,
        expectedScorecards: expected.size,
        submittedScorecards: submittedPairs.length,
        leaderboard: (await computeLeaderboard(eventId, roundId)).slice(0, 10),
      };
    }

    const sum = (rows: { _count: number }[]) => rows.reduce((s, r) => s + r._count, 0);
    const regCount = (s: string) => regs.find((r) => r.status === s)?._count ?? 0;
    const phases = ["PRE", "DURING", "POST"].map((phase) => {
      const rows = tasks.filter((t) => t.phase === phase);
      return {
        phase,
        total: sum(rows),
        done: sum(rows.filter((r) => r.status === "DONE" || r.status === "SKIPPED")),
      };
    });

    return {
      event,
      registrations: {
        total: sum(regs.filter((r) => !["CANCELLED", "REJECTED"].includes(r.status))),
        checkedIn: regCount("CHECKED_IN"),
        waitlisted: regCount("WAITLISTED"),
        byStatus: Object.fromEntries(regs.map((r) => [r.status, r._count])),
        capacity: event.capacity,
      },
      tasks: { phases, overdue },
      teams: { total: teams, submitted },
      judging,
      guests: Object.fromEntries(guests.map((g) => [g.status, g._count])),
      media: { driveFolderUrl: event.driveFolderUrl, byKind: Object.fromEntries(media.map((m) => [m.kind, m._count])) },
      social: social.map((s) => ({ platform: s.platform, status: s.status, count: s._count })),
      certificates: { total: sum(certs), byType: Object.fromEntries(certs.map((c) => [c.type, c._count])) },
      linkedin: { total: sum(linkedin), byStatus: Object.fromEntries(linkedin.map((l) => [l.status, l._count])) },
      feedback: { responses: feedback._count, avgRating: feedback._avg.rating },
      budget: { planned: Number(expenses._sum.planned ?? 0), actual: Number(expenses._sum.actual ?? 0) },
      activity,
    };
  });

  app.get<{ Params: { id: string } }>("/events/:id/activity", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { limit, before } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(100), before: z.coerce.date().optional() })
      .parse(req.query);
    return prisma.eventActivity.findMany({
      where: { eventId: event.id, ...(before && { createdAt: { lt: before } }) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
  });

  // Sessions (agenda) — small helper endpoints used by the event editor.
  app.post<{ Params: { id: string } }>("/events/:id/sessions", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        title: z.string().min(1),
        speaker: z.string().optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        location: z.string().optional(),
      })
      .parse(req.body);
    const session = await prisma.eventSession.create({ data: { ...body, eventId: event.id } });
    return reply.status(201).send(session);
  });

  // Event staff (managers, volunteers, photographers, mentors, social team).
  app.get<{ Params: { id: string } }>("/events/:id/staff", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.eventStaff.findMany({
      where: { eventId: event.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
  });

  app.post<{ Params: { id: string } }>("/events/:id/staff", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z.enum(["MANAGER", "VOLUNTEER", "PHOTOGRAPHER", "MENTOR", "SOCIAL"]),
      })
      .parse(req.body);
    const email = body.email.toLowerCase();
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { email, name: body.name ?? email.split("@")[0] } }));
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: event.tenantId, userId: user.id } },
      create: { tenantId: event.tenantId, userId: user.id, role: body.role === "VOLUNTEER" ? "VOLUNTEER" : "STUDENT" },
      update: {},
    });
    const staff = await prisma.eventStaff.upsert({
      where: { eventId_userId_role: { eventId: event.id, userId: user.id, role: body.role } },
      create: { eventId: event.id, userId: user.id, role: body.role },
      update: {},
    });
    await logActivity(event.id, req.auth!.user.id, "staff.added", { userId: user.id, role: body.role });
    return reply.status(201).send(staff);
  });

  app.delete<{ Params: { id: string; staffId: string } }>("/events/:id/staff/:staffId", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    await prisma.eventStaff.deleteMany({ where: { id: req.params.staffId, eventId: event.id } });
    return { ok: true };
  });
}
