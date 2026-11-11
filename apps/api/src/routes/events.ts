import { googleCalendarUrl, icsToken } from "./eventPage";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EventStatus, Prisma } from "@prisma/client";
import {
  DEFAULT_CHECKLISTS,
  DEFAULT_MODULES,
  EVENT_FAMILIES,
  EVENT_FAMILY_KEYS,
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  REVIEWER_ROLES,
  createEventSchema,
  taskNeedsProof,
  taskTeamFor,
} from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import {
  canManageEvent,
  findEvent,
  hasRole,
  isOrganizer,
  isStaff,
  requireBrandAdmin,
  requireEventCreator,
  requireEventManager,
  requireReviewer,
  roleOf,
} from "../lib/permissions";
import { APPROVAL_STATUSES } from "@elevate/shared";
import { slugify } from "../lib/codes";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { canTransition, runCompletionAutomation } from "../lib/lifecycle";
import { computeLeaderboard, defaultRoundId, judgesPerTeam, roundTeamIds } from "../lib/judging";
import { enqueue, fmtDate, notifyAudience, safely } from "../lib/notify";
import { brandBaseUrl, apiBaseUrl } from "../lib/brand";
import { newToken } from "./guests";
import { eventWinners } from "./hackathon";
import { sanitizeHtml, sanitizeSections } from "../lib/html";
import { currentFee, isPaidEvent, paymentResponse, revenueFor } from "../lib/payments";
import { CATEGORY_SELECT, eventMeta, normalizeTags, parseTagQuery, storedTagSpellings } from "../lib/tags";

const HIDDEN_FROM_PUBLIC: EventStatus[] = ["DRAFT", "PLANNING"];
const DAY = 24 * 60 * 60 * 1000;

const DEFAULT_RUBRIC = [
  { name: "Innovation", description: "Originality and creativity of the idea", maxScore: 10, weight: 1.5 },
  { name: "Technical execution", description: "Quality and completeness of the build", maxScore: 10, weight: 1.5 },
  { name: "Impact", description: "Usefulness and potential real-world impact", maxScore: 10, weight: 1 },
  { name: "Presentation", description: "Clarity of the demo and pitch", maxScore: 10, weight: 1 },
];

const createSchema = createEventSchema.extend({ type: z.enum(EVENT_TYPES).optional() });

const updateEventSchema = createEventSchema
  .omit({ type: true })
  .partial()
  .extend({
    ownerId: z.string().nullable().optional(),
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
    livestreamUrl: z.string().url().nullable().optional(),
    venueMapUrl: z.string().url().nullable().optional(),
    contactEmail: z.string().email().nullable().optional(),
    contactPhone: z.string().nullable().optional(),
    venue: z.string().nullable().optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    description: z.string().max(200_000).nullable().optional(),
    parentEventId: z.string().nullable().optional(),
    feeAmount: z.number().int().min(0).nullable().optional(),
    earlyBirdAmount: z.number().int().min(0).nullable().optional(),
    earlyBirdEndsAt: z.coerce.date().nullable().optional(),
    submissionsOpenAt: z.coerce.date().nullable().optional(),
    submissionsCloseAt: z.coerce.date().nullable().optional(),
    categoryId: z.string().nullable().optional(),
  });

/** A fest's sub-event must be another event of the same brand, and not create a cycle. */
async function validateParent(tenantId: string, parentEventId: string | null | undefined, selfId?: string) {
  if (!parentEventId) return;
  if (parentEventId === selfId) throw badRequest("An event can't be its own parent");
  const parent = await prisma.event.findFirst({ where: { tenantId, OR: [{ id: parentEventId }, { slug: parentEventId }] } });
  if (!parent) throw badRequest("Unknown parent event");
  if (selfId && parent.parentEventId === selfId) throw badRequest("Those events would contain each other");
  return parent.id;
}

function validateFee(fee: { feeAmount?: number | null; earlyBirdAmount?: number | null }, paidAllowed = true) {
  if (!paidAllowed && fee.feeAmount) throw badRequest("This event can't charge a fee yet. Ask an admin to allow paid registration.");
  if (fee.feeAmount && fee.feeAmount < 100) throw badRequest("The fee must be at least 1.00 (100 paise)");
  if (fee.earlyBirdAmount !== null && fee.earlyBirdAmount !== undefined && fee.feeAmount && fee.earlyBirdAmount > fee.feeAmount) {
    throw badRequest("The early-bird price can't be more than the normal fee");
  }
}

/** Checklist rows for a new event: the brand's templates for the type, else the defaults. */
export async function checklistFor(tenantId: string, type: (typeof EVENT_TYPES)[number], startsAt: Date, ownerId?: string) {
  const templates = await prisma.taskTemplate.findMany({ where: { tenantId, eventType: type }, orderBy: { sortOrder: "asc" } });
  const checklist: { phase: "PRE" | "DURING" | "POST"; title: string; dueOffsetDays: number; team?: string | null; proof?: boolean; proofRequired?: boolean }[] =
    templates.length ? templates : DEFAULT_CHECKLISTS[type];
  return checklist.map((t, i) => {
    const team = t.team ?? taskTeamFor(t.title);
    return {
      phase: t.phase,
      title: t.title,
      sortOrder: i,
      dueAt: new Date(startsAt.getTime() + t.dueOffsetDays * DAY),
      team,
      proofRequired: t.proof ?? t.proofRequired ?? taskNeedsProof(t.title),
      // The owner's own tasks are assigned to them; team tasks stay with the team until someone picks them up.
      ...(team === "OWNER" && ownerId && { assigneeId: ownerId }),
    };
  });
}

export const COMPETITION_TYPES = ["HACKATHON", "COMPETITION", "STARTUP_PITCH"];
/** Scored contests: a "Final" round with a single score criterion instead of the hackathon rubric. */
export const CONTEST_TYPES = ["CODING_CONTEST", "QUIZ"];
const CONTEST_RUBRIC = [{ name: "Score", description: "Points scored", maxScore: 100, weight: 1 }];

type EventTypeKey = (typeof EVENT_TYPES)[number];

/** Loads a brand event type (EventCategory) and checks it against an explicit `type`. */
async function resolveCategory(tenantId: string, categoryId: string, type?: EventTypeKey) {
  const category = await prisma.eventCategory.findFirst({ where: { id: categoryId, tenantId } });
  if (!category) throw badRequest("Unknown event type");
  if (type && type !== category.baseType) {
    throw badRequest(`"${category.name}" events are ${EVENT_TYPE_LABELS[category.baseType]} events; type must be ${category.baseType}`);
  }
  return category;
}

export async function uniqueSlug(tenantId: string, title: string): Promise<string> {
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
        q: z.string().trim().optional(),
        family: z.enum(EVENT_FAMILY_KEYS).optional(),
        categoryId: z.string().optional(),
        tag: z.union([z.string(), z.array(z.string())]).optional(),
        parentId: z.string().optional(),
        approval: z.enum(APPROVAL_STATUSES).optional(),
        /** With campusId: only that campus's own events (without central ones) */
        campusOnly: z.coerce.boolean().optional(),
        mine: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);

    const staff = isStaff(req);
    const familyTypes = q.family ? EVENT_FAMILIES.find((f) => f.key === q.family)!.types : null;
    const tags = await storedTagSpellings(tenant.id, parseTagQuery(q.tag));
    const and: Prisma.EventWhereInput[] = [];
    if (q.campusId) and.push(q.campusOnly ? { campuses: { some: { campusId: q.campusId } } } : { OR: [{ scope: "CENTRAL" }, { campuses: { some: { campusId: q.campusId } } }] });
    if (q.q) and.push({ OR: [{ title: { contains: q.q, mode: "insensitive" } }, { tagline: { contains: q.q, mode: "insensitive" } }] });
    if (familyTypes) and.push({ type: { in: familyTypes } });
    const where: Prisma.EventWhereInput = {
      tenantId: tenant.id,
      ...(q.type && { type: q.type }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(tags.length && { tags: { hasSome: tags } }),
      ...(q.upcoming && { endsAt: { gte: new Date() } }),
      ...(q.past && { endsAt: { lt: new Date() } }),
      ...(q.search && { title: { contains: q.search, mode: "insensitive" } }),
      ...(q.parentId && { parentEventId: q.parentId }),
      ...(and.length && { AND: and }),
    };
    const me = req.auth?.user.id;
    const extra: Prisma.EventWhereInput[] = [];
    const ownEvents: Prisma.EventWhereInput = { OR: [{ createdById: me }, { staff: { some: { userId: me, role: "MANAGER" } } }] };
    if (q.mine && me) extra.push(ownEvents);
    if (q.approval) extra.push({ approvalStatus: q.approval });
    if (q.status) {
      if (!staff && HIDDEN_FROM_PUBLIC.includes(q.status) && !(me && isOrganizer(req))) return [];
      where.status = q.status;
    }
    if (!staff) {
      // The public sees published, approved events; organizers also see their own drafts.
      const visible: Prisma.EventWhereInput = { status: { notIn: HIDDEN_FROM_PUBLIC }, approvalStatus: "APPROVED" };
      extra.push(me && isOrganizer(req) ? { OR: [visible, ownEvents] } : visible);
    }
    if (extra.length) where.AND = [...and, ...extra];

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { startsAt: q.past ? "desc" : "asc" },
        take: q.limit,
        skip: q.offset,
        include: {
          campuses: { include: { campus: { select: { id: true, name: true, code: true } } } },
          category: CATEGORY_SELECT,
          _count: { select: { registrations: true, teams: true } },
          ...(staff && { owner: { select: { id: true, name: true } } }),
        },
      }),
      prisma.event.count({ where }),
    ]);
    reply.header("X-Total-Count", String(total));
    // Staff see each event's checklist health: done, overdue, and tasks missing their proof link.
    const checklist = new Map<string, { total: number; done: number; overdue: number; proofMissing: number }>();
    if (staff && items.length) {
      const tasks = await prisma.eventTask.findMany({
        where: { eventId: { in: items.map((e) => e.id) } },
        select: { eventId: true, status: true, dueAt: true, proofRequired: true, evidenceUrl: true },
      });
      const now = new Date();
      for (const t of tasks) {
        const c = checklist.get(t.eventId) ?? { total: 0, done: 0, overdue: 0, proofMissing: 0 };
        const finished = t.status === "DONE" || t.status === "SKIPPED";
        c.total++;
        if (finished) c.done++;
        else if (t.dueAt && t.dueAt < now) c.overdue++;
        if (t.proofRequired && t.status !== "SKIPPED" && !t.evidenceUrl) c.proofMissing++;
        checklist.set(t.eventId, c);
      }
    }
    return items.map((e) => ({
      ...e,
      ...eventMeta(e),
      outcome: undefined,
      previewToken: staff ? e.previewToken : undefined,
      campuses: e.campuses.map((c) => ({ campus: c.campus })),
      ...(staff && { checklist: checklist.get(e.id) ?? { total: 0, done: 0, overdue: 0, proofMissing: 0 } }),
    }));
  });

  app.get<{ Params: { idOrSlug: string } }>("/events/:idOrSlug", async (req) => {
    const base = await findEvent(req, req.params.idOrSlug);
    const manager = await canManageEvent(req, base);
    const { preview } = z.object({ preview: z.string().optional() }).parse(req.query);
    const previewing = !!preview && preview === base.previewToken;
    if (!manager && !previewing && (HIDDEN_FROM_PUBLIC.includes(base.status) || base.approvalStatus !== "APPROVED")) throw notFound("Event");

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        campuses: { include: { campus: { select: { id: true, name: true, code: true, city: true } } } },
        sessions: { orderBy: { startsAt: "asc" } },
        guests: manager
          ? { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }
          : {
              where: { isPublic: true, status: { in: previewing ? ["PROPOSED", "INVITED", "CONFIRMED", "ARRIVED", "THANKED"] : ["CONFIRMED", "ARRIVED", "THANKED"] } },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              select: {
                id: true, profileId: true, name: true, designation: true, organization: true, bio: true, photoUrl: true, linkedinUrl: true,
                role: true, talkTitle: true, talkAbstract: true, sessionAt: true,
              },
            },
        sponsors: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        rubric: { orderBy: { sortOrder: "asc" } },
        category: CATEGORY_SELECT,
        _count: { select: { registrations: true, teams: true } },
        ...(manager && { owner: { select: { id: true, name: true } } }),
      },
    });

    let myRegistration = null;
    let myTeam = null;
    let myPayment = null;
    if (req.auth) {
      const userId = req.auth.user.id;
      myRegistration = await prisma.registration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId } },
      });
      const tm = await prisma.teamMember.findFirst({
        where: { userId, team: { eventId: event.id } },
        include: {
          team: {
            include: {
              members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }, orderBy: { joinedAt: "asc" } },
              problemStatement: { select: { id: true, code: true, title: true } },
            },
          },
        },
      });
      myTeam = tm?.team ?? null;
      const p = await prisma.payment.findFirst({
        where: { eventId: event.id, OR: [{ userId }, { registrations: { some: { userId } } }] },
        orderBy: { createdAt: "desc" },
      });
      if (p) myPayment = { ...(await paymentResponse(p)), payerId: p.userId, teamId: p.teamId, createdAt: p.createdAt };
    }

    const now = new Date();
    const [problemStatements, rounds, parent, subEvents, winners] = await Promise.all([
      prisma.problemStatement.findMany({
        where: { eventId: event.id, ...(!manager && { OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] }) },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.judgingRound.findMany({
        where: { eventId: event.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, isOpen: true, closedAt: true, opensAt: true, closesAt: true, description: true, sortOrder: true },
      }),
      event.parentEventId ? prisma.event.findUnique({ where: { id: event.parentEventId }, select: { id: true, slug: true, title: true, status: true } }) : null,
      prisma.event.findMany({
        where: { parentEventId: event.id, ...(!manager && { status: { notIn: HIDDEN_FROM_PUBLIC } }) },
        orderBy: { startsAt: "asc" },
        select: {
          id: true, slug: true, title: true, tagline: true, type: true, startsAt: true, endsAt: true, mode: true, coverImageUrl: true, status: true,
          venue: true, feeAmount: true, currency: true, feeType: true, tags: true, category: CATEGORY_SELECT,
          _count: { select: { registrations: true } },
        },
      }),
      event.resultsPublishedAt ? eventWinners(event.id) : Promise.resolve([]),
    ]);
    const roundName = new Map(rounds.map((r) => [r.id, r.name]));
    const fee = isPaidEvent(event)
      ? {
          amount: event.feeAmount!,
          currency: event.currency,
          feeType: event.feeType,
          earlyBirdAmount: event.earlyBirdAmount,
          earlyBirdEndsAt: event.earlyBirdEndsAt,
          currentAmount: currentFee(event, now).amount,
        }
      : null;

    // "From the community": featured LinkedIn / Instagram / YouTube posts, newest first.
    const highlights = await prisma.socialPost.findMany({
      where: { eventId: event.id, featured: true, url: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, platform: true, url: true, authorName: true },
    });

    const gallery = await prisma.mediaAsset.findMany({
      where: { eventId: event.id, kind: "PHOTO" },
      orderBy: [{ isHighlight: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: { id: true, url: true, caption: true, title: true, isHighlight: true, createdAt: true },
    });

    // The joining link (Meet / Zoom) is only for the organisers and people with a confirmed registration.
    const seesLink = manager || (!!myRegistration && ["REGISTERED", "APPROVED", "CHECKED_IN", "NO_SHOW"].includes(myRegistration.status));
    return {
      ...event,
      meetingUrl: seesLink ? event.meetingUrl : null,
      hasMeetingLink: !!event.meetingUrl,
      // Personal calendar links for a confirmed registration (include the joining link).
      ...(seesLink && myRegistration && {
        myCalendar: {
          ics: `${apiBaseUrl()}/v1/events/${event.id}/calendar.ics?r=${myRegistration.id}&t=${icsToken(myRegistration.id)}`,
          google: googleCalendarUrl(event, `${await brandBaseUrl(event.tenantId)}/events/${event.slug}`),
        },
      }),
      ...eventMeta(event),
      gallery,
      highlights,
      previewToken: manager ? event.previewToken : undefined,
      outcome: manager ? event.outcome : undefined,
      campuses: event.campuses.map((c) => ({ campus: c.campus })),
      canManage: manager,
      myRegistration,
      myTeam,
      myPayment,
      pageSections: event.pageSections ?? [],
      fee,
      problemStatements: problemStatements.map((p) => ({ ...p, releaseAt: manager ? p.releaseAt : undefined })),
      rubricPublic: event.rubric.map((c) => ({
        name: c.name, description: c.description, maxScore: c.maxScore, weight: c.weight, roundName: c.roundId ? roundName.get(c.roundId) ?? null : null,
      })),
      rounds,
      parentEvent: parent && (manager || !HIDDEN_FROM_PUBLIC.includes(parent.status)) ? { id: parent.id, slug: parent.slug, title: parent.title } : null,
      subEvents: subEvents.map((e) => ({ ...e, ...eventMeta(e) })),
      winners,
      submissionsOpenAt: event.submissionsOpenAt,
      submissionsCloseAt: event.submissionsCloseAt,
    };
  });

  app.post("/events", async (req, reply) => {
    const auth = requireEventCreator(req);
    const tenant = requireTenant(req);
    const parsed = createSchema.parse(req.body);
    // Organizers' pages wait for approval and stay free until an admin allows paid registration.
    const organizer = isOrganizer(req);
    const category = parsed.categoryId ? await resolveCategory(tenant.id, parsed.categoryId, parsed.type) : null;
    if (category?.archivedAt) throw badRequest(`"${category.name}" is archived`);
    const type = category?.baseType ?? parsed.type;
    if (!type) throw badRequest("type: Required");
    const input = { ...parsed, type };
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
    validateFee(input, !organizer);
    const parentEventId = await validateParent(tenant.id, input.parentEventId);

    // Base type defaults ⊕ brand type overrides ⊕ explicit modules. Checklist and page templates follow the base type.
    const modules = {
      ...DEFAULT_MODULES[input.type],
      ...((category?.modules as Record<string, boolean> | null) ?? {}),
      ...(input.modules ?? {}),
    };
    const tags = normalizeTags(input.tags, category?.defaultTags);
    const checklist = await checklistFor(tenant.id, input.type, input.startsAt, auth.user.id);
    const isCompetition = COMPETITION_TYPES.includes(input.type);
    const isContest = CONTEST_TYPES.includes(input.type);
    const config = {
      ...(isCompetition ? { minTeamSize: 2, maxTeamSize: 4, tracks: [] } : {}),
      ...(isContest && modules.teams ? { minTeamSize: 1, maxTeamSize: 2 } : {}),
      ...(input.config ?? {}),
    };

    const { campusIds, pageSections, categoryId: _c, tags: _t, ...fields } = input;
    const event = await prisma.event.create({
      data: {
        ...fields,
        parentEventId: parentEventId ?? null,
        ...(fields.description !== undefined && { description: sanitizeHtml(fields.description) }),
        ...(pageSections && { pageSections: sanitizeSections(pageSections) }),
        modules,
        tags,
        categoryId: category?.id ?? null,
        config: config as Prisma.InputJsonValue,
        tenantId: tenant.id,
        slug: await uniqueSlug(tenant.id, input.title),
        previewToken: newToken(),
        createdById: auth.user.id,
        ownerId: auth.user.id,
        ...(organizer && { approvalStatus: "DRAFT" as const, paidAllowed: false }),
        campuses: { create: campusIds.map((campusId) => ({ campusId })) },
        staff: { create: [{ userId: auth.user.id, role: "MANAGER" }] },
        tasks: { create: checklist },
        ...((isCompetition || isContest) && {
          rubric: { create: (isContest ? CONTEST_RUBRIC : DEFAULT_RUBRIC).map((c, i) => ({ ...c, sortOrder: i })) },
          rounds: { create: [{ name: "Final", sortOrder: 0, isOpen: false }] },
        }),
      },
      include: { category: CATEGORY_SELECT },
    });
    await logActivity(event.id, auth.user.id, "event.created", {
      title: event.title, type: event.type, ...(category && { category: category.name }),
    });
    return reply.status(201).send({ ...event, ...eventMeta(event) });
  });

  app.patch<{ Params: { id: string } }>("/events/:id", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const input = updateEventSchema.parse(req.body);
    if (input.ownerId !== undefined && input.ownerId !== event.ownerId) {
      // Only admins or the current owner hand an event over, and only to someone on the brand's team.
      if (!hasRole(req, ["BRAND_ADMIN"]) && req.auth!.user.id !== event.ownerId) throw forbidden("Only an admin or the current owner can change the owner");
    }
    if (input.ownerId && input.ownerId !== event.ownerId) {
      const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: event.tenantId, userId: input.ownerId } } });
      if (!m || m.role === "STUDENT") throw badRequest("The new owner must be on the team (not a regular user)");
    }
    const { campusIds, modules, config, registrationForm, pageSections, parentEventId, categoryId, tags, ...fields } = input;
    // A brand type must be based on the event's type (the type itself can't change after creation).
    const category = categoryId ? await resolveCategory(event.tenantId, categoryId, event.type) : null;
    const categoryChanged = categoryId !== undefined && categoryId !== event.categoryId;
    if (category?.archivedAt && categoryChanged) throw badRequest(`"${category.name}" is archived`);
    const nextTags =
      tags !== undefined || (category && categoryChanged)
        ? normalizeTags(tags ?? event.tags, categoryChanged ? category?.defaultTags : undefined)
        : undefined;
    const categoryModules = category && categoryChanged ? ((category.modules as Record<string, boolean> | null) ?? {}) : {};
    if (campusIds) await validateCampuses(event.tenantId, campusIds);
    validateFee({
      feeAmount: fields.feeAmount !== undefined ? fields.feeAmount : event.feeAmount,
      earlyBirdAmount: fields.earlyBirdAmount !== undefined ? fields.earlyBirdAmount : event.earlyBirdAmount,
    }, event.paidAllowed || fields.feeAmount === undefined);
    const parentId = parentEventId ? await validateParent(event.tenantId, parentEventId, event.id) : parentEventId;
    if (fields.description) fields.description = sanitizeHtml(fields.description);

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
          ...((modules || Object.keys(categoryModules).length) && {
            modules: { ...(event.modules as object), ...categoryModules, ...(modules ?? {}) },
          }),
          ...(categoryId !== undefined && { categoryId: category?.id ?? null }),
          ...(nextTags && { tags: nextTags }),
          ...(config && { config: { ...(event.config as object), ...config } as Prisma.InputJsonValue }),
          ...(registrationForm && { registrationForm }),
          ...(pageSections && { pageSections: sanitizeSections(pageSections) }),
          ...(parentId !== undefined && { parentEventId: parentId }),
        },
        include: { category: CATEGORY_SELECT },
      });
    });
    await logActivity(event.id, req.auth!.user.id, "event.updated", { fields: Object.keys(input) });

    // Tell registrants when the time or place changes on a published event.
    if (!HIDDEN_FROM_PUBLIC.includes(updated.status) && updated.status !== "CANCELLED" && updated.endsAt > new Date()) {
      const changes: string[] = [];
      if (updated.startsAt.getTime() !== event.startsAt.getTime() || updated.endsAt.getTime() !== event.endsAt.getTime()) {
        changes.push(`New time: ${fmtDate(updated.startsAt)}`);
      }
      if ((updated.venue ?? "") !== (event.venue ?? "")) changes.push(`New venue: ${updated.venue ?? "to be announced"}`);
      if ((updated.meetingUrl ?? "") !== (event.meetingUrl ?? "")) changes.push(`New joining link: ${updated.meetingUrl ?? "to be shared"}`);
      if (changes.length) {
        safely("event.updated", () => notifyAudience(event.id, "event.updated", { changes, dedupSuffix: String(updated.updatedAt.getTime()) }));
      }
    }
    return { ...updated, ...eventMeta(updated) };
  });

  app.post<{ Params: { id: string } }>("/events/:id/status", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { status } = z.object({ status: z.enum(EVENT_STATUSES) }).parse(req.body);
    if (!canTransition(event.status, status)) {
      throw badRequest(`Can't move an event from ${event.status} to ${status}`);
    }
    if (event.approvalStatus !== "APPROVED" && !HIDDEN_FROM_PUBLIC.includes(status) && status !== "CANCELLED") {
      throw badRequest("This event needs approval from an admin or moderator before it can be published. Submit it for review first.");
    }
    const updated = await prisma.event.update({ where: { id: event.id }, data: { status }, include: { category: CATEGORY_SELECT } });
    await logActivity(event.id, req.auth!.user.id, "status.changed", { from: event.status, to: status });
    if (status === "COMPLETED") runCompletionAutomation(event.id, req.log);
    if (status === "CANCELLED") safely("event.cancelled", () => notifyAudience(event.id, "event.cancelled"));
    return { ...updated, ...eventMeta(updated) };
  });

  // ───────── Approval (organizer-created events) ─────────

  app.post<{ Params: { id: string } }>("/events/:id/submit", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    if (event.approvalStatus === "APPROVED") throw badRequest("This event is already approved");
    if (event.approvalStatus === "PENDING") throw badRequest("This event is already waiting for review");
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { approvalStatus: "PENDING", submittedAt: new Date() },
      include: { category: CATEGORY_SELECT },
    });
    await logActivity(event.id, req.auth!.user.id, "approval.submitted", {});
    safely("approval.submitted", async () => {
      const reviewers = await prisma.membership.findMany({
        where: { tenantId: event.tenantId, role: { in: REVIEWER_ROLES as ("BRAND_ADMIN" | "MODERATOR")[] } },
        select: { userId: true },
      });
      const url = `${await brandBaseUrl(event.tenantId)}/admin/review`;
      for (const r of reviewers) {
        await enqueue({
          tenantId: event.tenantId, eventId: event.id, userId: r.userId, channels: ["EMAIL", "IN_APP"],
          template: "approval.submitted",
          subject: `Review needed: ${event.title}`,
          body: `${req.auth!.user.name} submitted "${event.title}" for review. It stays hidden until an admin or moderator approves it.`,
          ctaLabel: "Review events", ctaUrl: url,
          dedupKey: `approval.submitted:${event.id}:${updated.submittedAt!.getTime()}:${r.userId}`,
        });
      }
    });
    return { ...updated, ...eventMeta(updated) };
  });

  app.post<{ Params: { id: string } }>("/events/:id/review", async (req) => {
    const auth = requireReviewer(req);
    const event = await findEvent(req, req.params.id);
    const body = z
      .object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(2000).optional() })
      .parse(req.body);
    if (body.decision === "REJECT" && !body.note) throw badRequest("Please say what needs to change, so the organizer can fix it");
    const approved = body.decision === "APPROVE";
    // Approving publishes the page (as "Announced") if it was still hidden.
    const publish = approved && HIDDEN_FROM_PUBLIC.includes(event.status);
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        approvalStatus: approved ? "APPROVED" : "REJECTED",
        approvalNote: body.note ?? null,
        reviewedAt: new Date(),
        reviewedById: auth.user.id,
        ...(publish && { status: "ANNOUNCED" as const }),
      },
      include: { category: CATEGORY_SELECT },
    });
    await logActivity(event.id, auth.user.id, approved ? "approval.approved" : "approval.rejected", { note: body.note });
    if (publish) await logActivity(event.id, auth.user.id, "status.changed", { from: event.status, to: "ANNOUNCED" });
    if (event.createdById) {
      const organizerId = event.createdById;
      safely("approval.reviewed", async () => {
        const base = await brandBaseUrl(event.tenantId);
        await enqueue({
          tenantId: event.tenantId, eventId: event.id, userId: organizerId, channels: ["EMAIL", "IN_APP"],
          template: approved ? "approval.approved" : "approval.rejected",
          subject: approved ? `Approved: ${event.title} is live` : `Changes needed: ${event.title}`,
          body: approved
            ? `Good news! "${event.title}" has been approved and is now live.${body.note ? `\n\nNote from the reviewer: ${body.note}` : ""}`
            : `"${event.title}" needs a few changes before it can go live.\n\nWhat to change: ${body.note}\n\nEdit the page and submit it for review again.`,
          ctaLabel: approved ? "View the page" : "Edit the event",
          ctaUrl: approved ? `${base}/events/${event.slug}` : `${base}/admin/events/${event.id}`,
          dedupKey: `approval.reviewed:${event.id}:${updated.reviewedAt!.getTime()}`,
        });
      });
    }
    return { ...updated, ...eventMeta(updated) };
  });

  app.post<{ Params: { id: string } }>("/events/:id/paid-allowed", async (req) => {
    const auth = requireBrandAdmin(req);
    const event = await findEvent(req, req.params.id);
    const { allowed } = z.object({ allowed: z.boolean() }).parse(req.body);
    if (!allowed && event.feeAmount) throw badRequest("Set the fee to free first, then turn off paid registration");
    const updated = await prisma.event.update({ where: { id: event.id }, data: { paidAllowed: allowed }, include: { category: CATEGORY_SELECT } });
    await logActivity(event.id, auth.user.id, allowed ? "payments.allowed" : "payments.disallowed", {});
    return { ...updated, ...eventMeta(updated) };
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
      const round = await prisma.judgingRound.findUniqueOrThrow({ where: { id: roundId } });
      const teamIds = await roundTeamIds(round);
      const [submittedPairs, perTeam] = await Promise.all([
        prisma.score.groupBy({ by: ["teamId", "judgeId"], where: { roundId, submittedAt: { not: null }, teamId: { in: teamIds } } }),
        judgesPerTeam(eventId, roundId, teamIds),
      ]);
      const expected = new Set<string>();
      for (const [t, judges] of perTeam) for (const j of judges) expected.add(`${t}:${j}`);
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

    const eventCategory = event.categoryId
      ? await prisma.eventCategory.findUnique({ where: { id: event.categoryId }, select: { id: true, name: true, icon: true } })
      : null;
    return {
      event: { ...event, ...eventMeta({ ...event, category: eventCategory }) },
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
      revenue: { ...(await revenueFor({ eventId })), currency: event.currency },
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
