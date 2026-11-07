import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { EVENT_TYPES, PAGE_SECTION_TEMPLATES } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canManageEvent, findEvent, requireEventManager, requireUser } from "../lib/permissions";
import { forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { sanitizeHtml } from "../lib/html";
import { slugify } from "../lib/codes";

const HIDDEN = ["DRAFT", "PLANNING"];

const problemSchema = z.object({
  code: z.string().trim().max(20).nullable().optional(),
  title: z.string().trim().min(2).max(200),
  html: z.string().max(100_000).default(""),
  trackId: z.string().nullable().optional(),
  difficulty: z.string().max(40).nullable().optional(),
  sponsorName: z.string().max(120).nullable().optional(),
  attachments: z.array(z.object({ label: z.string().trim().min(1).max(120), url: z.string().url() })).max(20).optional(),
  releaseAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const AWARD_ORDER: Record<string, number> = { WINNER: 1, RUNNER_UP: 2, SECOND_RUNNER_UP: 3, SPECIAL_MENTION: 4 };

/** Published winners of an event, for the event page and the hall of fame. */
export async function eventWinners(eventId: string) {
  const teams = await prisma.team.findMany({
    where: { eventId, award: { not: null } },
    include: { members: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { joinedAt: "asc" } } },
  });
  return teams
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (AWARD_ORDER[a.award!] ?? 9) - (AWARD_ORDER[b.award!] ?? 9))
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      award: t.award,
      rank: t.rank,
      projectTitle: t.projectTitle,
      members: t.members.map((m) => ({ name: m.user.name, avatarUrl: m.user.avatarUrl })),
    }));
}

export function hackathonRoutes(app: FastifyInstance) {
  // ───────── Problem statements ─────────
  app.get<{ Params: { id: string } }>("/events/:id/problem-statements", async (req) => {
    const event = await findEvent(req, req.params.id);
    const staff = await canManageEvent(req, event);
    if (!staff && HIDDEN.includes(event.status)) throw notFound("Event");
    const now = new Date();
    const rows = await prisma.problemStatement.findMany({
      where: { eventId: event.id, ...(!staff && { OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] }) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { teams: true } } },
    });
    return rows.map(({ _count, ...p }) => ({ ...p, teamCount: _count.teams, ...(!staff && { releaseAt: undefined }) }));
  });

  app.post<{ Params: { id: string } }>("/events/:id/problem-statements", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = problemSchema.parse(req.body);
    const last = await prisma.problemStatement.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: "desc" } });
    const ps = await prisma.problemStatement.create({
      data: {
        ...body,
        html: sanitizeHtml(body.html),
        attachments: (body.attachments ?? []) as Prisma.InputJsonValue,
        sortOrder: body.sortOrder ?? (last?.sortOrder ?? -1) + 1,
        eventId: event.id,
      },
    });
    await logActivity(event.id, req.auth!.user.id, "problem_statement.created", { id: ps.id, title: ps.title });
    return reply.status(201).send(ps);
  });

  app.patch<{ Params: { psId: string } }>("/problem-statements/:psId", async (req) => {
    requireUser(req);
    const ps = await prisma.problemStatement.findUnique({ where: { id: req.params.psId }, include: { event: true } });
    if (!ps || ps.event.tenantId !== requireTenant(req).id) throw notFound("Problem statement");
    if (!(await canManageEvent(req, ps.event))) throw forbidden();
    const body = problemSchema.partial().parse(req.body);
    const { event: _e, ...updated } = await prisma.problemStatement.update({
      where: { id: ps.id },
      data: {
        ...body,
        ...(body.html !== undefined && { html: sanitizeHtml(body.html) }),
        ...(body.attachments && { attachments: body.attachments as Prisma.InputJsonValue }),
      },
      include: { event: true },
    });
    return updated;
  });

  app.delete<{ Params: { psId: string } }>("/problem-statements/:psId", async (req) => {
    requireUser(req);
    const ps = await prisma.problemStatement.findUnique({ where: { id: req.params.psId }, include: { event: true } });
    if (!ps || ps.event.tenantId !== requireTenant(req).id) throw notFound("Problem statement");
    if (!(await canManageEvent(req, ps.event))) throw forbidden();
    await prisma.problemStatement.delete({ where: { id: ps.id } });
    await logActivity(ps.eventId, req.auth!.user.id, "problem_statement.deleted", { title: ps.title });
    return { ok: true };
  });

  // ───────── Page section templates ─────────
  app.get<{ Params: { type: string } }>("/page-templates/:type", async (req) => {
    const type = req.params.type.toUpperCase();
    const sections = PAGE_SECTION_TEMPLATES[type] ?? [];
    return sections.map((s) => ({ id: slugify(s.title), ...s }));
  });

  // ───────── Hall of fame ─────────
  app.get("/winners", async (req) => {
    const tenant = requireTenant(req);
    const q = z
      .object({
        type: z.enum(EVENT_TYPES).optional(),
        year: z.coerce.number().int().min(2000).max(2100).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const events = await prisma.event.findMany({
      where: {
        tenantId: tenant.id,
        resultsPublishedAt: { not: null },
        status: { notIn: ["DRAFT", "PLANNING", "CANCELLED"] },
        teams: { some: { award: { not: null } } },
        ...(q.type && { type: q.type }),
        ...(q.year && { startsAt: { gte: new Date(Date.UTC(q.year, 0, 1)), lt: new Date(Date.UTC(q.year + 1, 0, 1)) } }),
      },
      orderBy: { startsAt: "desc" },
      take: q.limit,
      select: { id: true, slug: true, title: true, type: true, startsAt: true, endsAt: true, coverImageUrl: true, resultsPublishedAt: true },
    });
    return Promise.all(events.map(async (e) => ({ event: e, winners: await eventWinners(e.id) })));
  });
}
