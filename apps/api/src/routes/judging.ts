import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { DEFAULT_CRITERIA_LIBRARY, DEFAULT_JUDGE_COMMENTS, scoreInputSchema } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canManageEvent, findEvent, requireEventManager, requireStaff, requireUser } from "../lib/permissions";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { computeLeaderboard, criteriaForRound, defaultRoundId, judgeTeamIds, judgesPerTeam, roundTeamIds } from "../lib/judging";
import { logActivity } from "../lib/activity";
import { CATEGORY_SELECT, eventMeta } from "../lib/tags";
import { notifyResults, notifyRoundOpened, safely, enqueue, eventLinks, fmtDate } from "../lib/notify";

const AWARDS = ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP", "SPECIAL_MENTION"] as const;

const criterionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  maxScore: z.number().int().min(1).max(100).default(10),
  weight: z.number().min(0).max(10).default(1),
  roundId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const roundSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).nullable().optional(),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  restrictTeams: z.boolean().optional(),
  shareFeedback: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const scoreWithReviewSchema = scoreInputSchema.extend({
  review: z
    .object({
      comment: z.string().max(4000).optional(),
      tags: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
      recommend: z.boolean().optional(),
    })
    .optional(),
});

async function loadRound(req: FastifyRequest, roundId: string) {
  const round = await prisma.judgingRound.findUnique({ where: { id: roundId }, include: { event: true } });
  if (!round || round.event.tenantId !== requireTenant(req).id) throw notFound("Round");
  requireUser(req);
  if (!(await canManageEvent(req, round.event))) throw forbidden();
  return round;
}

async function assertRoundOfEvent(eventId: string, roundId: string | null | undefined) {
  if (!roundId) return;
  const r = await prisma.judgingRound.findFirst({ where: { id: roundId, eventId } });
  if (!r) throw badRequest("Unknown round");
}

async function assertTeamsOfEvent(eventId: string, teamIds: string[]) {
  if (!teamIds.length) return;
  const n = await prisma.team.count({ where: { eventId, id: { in: teamIds } } });
  if (n !== new Set(teamIds).size) throw badRequest("One or more teams don't belong to this event");
}

async function setShortlist(roundId: string, teamIds: string[]) {
  const unique = [...new Set(teamIds)];
  await prisma.$transaction([
    prisma.roundTeam.deleteMany({ where: { roundId } }),
    prisma.roundTeam.createMany({ data: unique.map((teamId) => ({ roundId, teamId })) }),
    prisma.judgingRound.update({ where: { id: roundId }, data: { restrictTeams: true } }),
  ]);
  return prisma.team.findMany({
    where: { id: { in: unique } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, projectTitle: true, trackId: true, submittedAt: true },
  });
}

/** Suggested remarks for judges: built-in + brand library + this event's own. */
async function judgeComments(tenantId: string, config: unknown): Promise<string[]> {
  const brand = await prisma.judgingPreset.findMany({ where: { tenantId, kind: "COMMENT" }, orderBy: { createdAt: "asc" } });
  const own = ((config ?? {}) as { judgeComments?: string[] }).judgeComments ?? [];
  return [...new Set([...DEFAULT_JUDGE_COMMENTS.map((c) => c.text), ...brand.map((b) => b.name), ...own])];
}

export function judgingRoutes(app: FastifyInstance) {
  // ───────── Rubric (judging parameters) ─────────
  app.get<{ Params: { id: string } }>("/events/:id/rubric", async (req) => {
    const event = await findEvent(req, req.params.id);
    const { roundId } = z.object({ roundId: z.string().optional() }).parse(req.query);
    const rows = roundId
      ? await criteriaForRound(event.id, roundId)
      : await prisma.rubricCriterion.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const rounds = await prisma.judgingRound.findMany({ where: { eventId: event.id }, select: { id: true, name: true } });
    const name = new Map(rounds.map((r) => [r.id, r.name]));
    return rows.map((c) => ({ ...c, roundName: c.roundId ? name.get(c.roundId) ?? null : null }));
  });

  app.put<{ Params: { id: string } }>("/events/:id/rubric", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const items = z.array(criterionSchema.extend({ id: z.string().optional() })).min(1).parse(req.body);
    for (const roundId of new Set(items.map((i) => i.roundId).filter(Boolean))) await assertRoundOfEvent(event.id, roundId);

    const current = await prisma.rubricCriterion.findMany({ where: { eventId: event.id } });
    const keep = new Set(items.map((i) => i.id).filter(Boolean));
    const removed = current.filter((c) => !keep.has(c.id));
    if (removed.length) {
      const scored = await prisma.score.count({ where: { criterionId: { in: removed.map((r) => r.id) } } });
      if (scored) throw conflict("Some criteria already have scores and can't be removed");
    }
    await prisma.$transaction([
      prisma.rubricCriterion.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } }),
      ...items.map((item, i) => {
        const data = {
          name: item.name, description: item.description ?? null, maxScore: item.maxScore, weight: item.weight,
          roundId: item.roundId ?? null, sortOrder: item.sortOrder ?? i,
        };
        return item.id && current.some((c) => c.id === item.id)
          ? prisma.rubricCriterion.update({ where: { id: item.id }, data })
          : prisma.rubricCriterion.create({ data: { ...data, eventId: event.id } });
      }),
    ]);
    await logActivity(event.id, req.auth!.user.id, "rubric.updated", { criteria: items.length });
    return prisma.rubricCriterion.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  });

  app.post<{ Params: { id: string } }>("/events/:id/rubric", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = criterionSchema.parse(req.body);
    await assertRoundOfEvent(event.id, body.roundId);
    const last = await prisma.rubricCriterion.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: "desc" } });
    const c = await prisma.rubricCriterion.create({
      data: { ...body, roundId: body.roundId ?? null, eventId: event.id, sortOrder: body.sortOrder ?? (last?.sortOrder ?? -1) + 1 },
    });
    return reply.status(201).send(c);
  });

  app.patch<{ Params: { criterionId: string } }>("/rubric/:criterionId", async (req) => {
    const c = await prisma.rubricCriterion.findUnique({ where: { id: req.params.criterionId }, include: { event: true } });
    if (!c || c.event.tenantId !== requireTenant(req).id) throw notFound("Criterion");
    requireUser(req);
    if (!(await canManageEvent(req, c.event))) throw forbidden();
    const body = criterionSchema.partial().parse(req.body);
    await assertRoundOfEvent(c.eventId, body.roundId);
    const { event: _e, ...rest } = await prisma.rubricCriterion.update({ where: { id: c.id }, data: body, include: { event: true } });
    return rest;
  });

  app.delete<{ Params: { criterionId: string } }>("/rubric/:criterionId", async (req) => {
    const c = await prisma.rubricCriterion.findUnique({ where: { id: req.params.criterionId }, include: { event: true } });
    if (!c || c.event.tenantId !== requireTenant(req).id) throw notFound("Criterion");
    requireUser(req);
    if (!(await canManageEvent(req, c.event))) throw forbidden();
    if (await prisma.score.count({ where: { criterionId: c.id } })) throw conflict("This criterion already has scores");
    await prisma.rubricCriterion.delete({ where: { id: c.id } });
    return { ok: true };
  });

  // ───────── Library (built-in + brand presets) ─────────
  app.get("/judging/library", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const presets = await prisma.judgingPreset.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
    return {
      criteria: [
        ...DEFAULT_CRITERIA_LIBRARY.map((c) => ({ id: null, ...c, builtIn: true })),
        ...presets
          .filter((p) => p.kind === "CRITERION")
          .map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", maxScore: p.maxScore ?? 10, weight: p.weight ?? 1, category: p.category ?? "Custom", builtIn: false })),
      ],
      comments: [
        ...DEFAULT_JUDGE_COMMENTS.map((c) => ({ id: null, ...c, builtIn: true })),
        ...presets.filter((p) => p.kind === "COMMENT").map((p) => ({ id: p.id, text: p.name, category: p.category ?? "Custom", builtIn: false })),
      ],
    };
  });

  app.post("/judging/library", async (req, reply) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const body = z
      .object({
        kind: z.enum(["CRITERION", "COMMENT"]),
        name: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        maxScore: z.number().int().min(1).max(100).optional(),
        weight: z.number().min(0).max(10).optional(),
        category: z.string().max(60).optional(),
      })
      .parse(req.body);
    const preset = await prisma.judgingPreset.create({ data: { ...body, tenantId: tenant.id } });
    return reply.status(201).send(preset);
  });

  app.delete<{ Params: { presetId: string } }>("/judging/library/:presetId", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const res = await prisma.judgingPreset.deleteMany({ where: { id: req.params.presetId, tenantId: tenant.id } });
    if (!res.count) throw notFound("Library item");
    return { ok: true };
  });

  // ───────── Rounds (checks) ─────────
  app.get<{ Params: { id: string } }>("/events/:id/rounds", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const rounds = await prisma.judgingRound.findMany({
      where: { eventId: event.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { teams: true, criteria: true, scores: true } }, teams: { select: { teamId: true } } },
    });
    return rounds.map(({ teams, ...r }) => ({ ...r, teamIds: teams.map((t) => t.teamId) }));
  });

  app.post<{ Params: { id: string } }>("/events/:id/rounds", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = roundSchema.parse(req.body);
    const last = await prisma.judgingRound.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: "desc" } });
    const round = await prisma.judgingRound.create({
      data: { ...body, eventId: event.id, sortOrder: body.sortOrder ?? (last?.sortOrder ?? -1) + 1 },
    });
    await logActivity(event.id, req.auth!.user.id, "round.created", { roundId: round.id, name: round.name });
    return reply.status(201).send(round);
  });

  app.patch<{ Params: { roundId: string } }>("/rounds/:roundId", async (req) => {
    const round = await loadRound(req, req.params.roundId);
    const body = roundSchema.partial().extend({ isOpen: z.boolean().optional() }).parse(req.body);
    const now = new Date();
    const opening = body.isOpen === true && !round.isOpen;
    const updated = await prisma.$transaction(async (tx) => {
      // Only one round may be open at a time: opening this one closes the others.
      if (opening) {
        await tx.judgingRound.updateMany({ where: { eventId: round.eventId, isOpen: true, id: { not: round.id } }, data: { isOpen: false, closedAt: now } });
      }
      return tx.judgingRound.update({
        where: { id: round.id },
        data: {
          ...body,
          ...(body.isOpen === false && round.isOpen && { closedAt: now }),
          ...(opening && { closedAt: null }),
        },
      });
    });
    if (body.isOpen !== undefined && body.isOpen !== round.isOpen) {
      await logActivity(round.eventId, req.auth!.user.id, body.isOpen ? "round.opened" : "round.closed", { roundId: round.id, name: round.name });
      if (opening) safely("round.opened", () => notifyRoundOpened(round.id));
    }
    return updated;
  });

  app.delete<{ Params: { roundId: string } }>("/rounds/:roundId", async (req) => {
    const round = await loadRound(req, req.params.roundId);
    if (await prisma.score.count({ where: { roundId: round.id } })) throw conflict("This round already has scores and can't be deleted");
    await prisma.judgingRound.delete({ where: { id: round.id } });
    await logActivity(round.eventId, req.auth!.user.id, "round.deleted", { name: round.name });
    return { ok: true };
  });

  app.get<{ Params: { roundId: string } }>("/rounds/:roundId/teams", async (req) => {
    const round = await loadRound(req, req.params.roundId);
    const ids = await roundTeamIds(round);
    const teams = await prisma.team.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projectTitle: true, trackId: true, submittedAt: true },
    });
    return { restrictTeams: round.restrictTeams, teams };
  });

  /** Sets the round's shortlist (and restricts the round to it). */
  app.post<{ Params: { roundId: string } }>("/rounds/:roundId/teams", async (req) => {
    const round = await loadRound(req, req.params.roundId);
    const { teamIds } = z.object({ teamIds: z.array(z.string()) }).parse(req.body);
    await assertTeamsOfEvent(round.eventId, teamIds);
    const teams = await setShortlist(round.id, teamIds);
    await logActivity(round.eventId, req.auth!.user.id, "round.shortlisted", { roundId: round.id, name: round.name, teams: teams.length });
    return teams;
  });

  /** Shortlists the top N / above a score / chosen teams of an earlier round into this one. */
  app.post<{ Params: { roundId: string } }>("/rounds/:roundId/advance", async (req) => {
    const round = await loadRound(req, req.params.roundId);
    const body = z
      .object({
        fromRoundId: z.string(),
        top: z.number().int().min(1).optional(),
        minScore: z.number().min(0).max(100).optional(),
        teamIds: z.array(z.string()).optional(),
      })
      .parse(req.body);
    if (body.fromRoundId === round.id) throw badRequest("Pick an earlier round to advance from");
    const from = await prisma.judgingRound.findFirst({ where: { id: body.fromRoundId, eventId: round.eventId } });
    if (!from) throw badRequest("Unknown round to advance from");
    if (body.top === undefined && body.minScore === undefined && !body.teamIds?.length) throw badRequest("Give top, minScore or teamIds");

    const rows = await computeLeaderboard(round.eventId, from.id);
    let picked = rows;
    if (body.minScore !== undefined) picked = picked.filter((r) => r.judgesScored > 0 && r.avgWeighted >= body.minScore!);
    if (body.top !== undefined) picked = picked.filter((r) => r.judgesScored > 0).slice(0, body.top);
    if (body.top === undefined && body.minScore === undefined) picked = [];
    const ids = new Set(picked.map((r) => r.team.id));
    if (body.teamIds?.length) {
      await assertTeamsOfEvent(round.eventId, body.teamIds);
      for (const id of body.teamIds) ids.add(id);
    }
    const teams = await setShortlist(round.id, [...ids]);
    await logActivity(round.eventId, req.auth!.user.id, "round.advanced", { from: from.name, to: round.name, teams: teams.length });
    return teams;
  });

  /** Per judge: teams scored (submitted) / teams to score in this round. */
  app.get<{ Params: { roundId: string } }>("/rounds/:roundId/progress", async (req) => {
    const round = await loadRound(req, req.params.roundId);
    const teamIds = await roundTeamIds(round);
    const perTeam = await judgesPerTeam(round.eventId, round.id, teamIds);
    const totals = new Map<string, number>();
    for (const judges of perTeam.values()) for (const j of judges) totals.set(j, (totals.get(j) ?? 0) + 1);
    const [submitted, users] = await Promise.all([
      prisma.score.groupBy({ by: ["judgeId", "teamId"], where: { roundId: round.id, submittedAt: { not: null }, teamId: { in: teamIds } } }),
      prisma.user.findMany({ where: { id: { in: [...totals.keys()] } }, select: { id: true, name: true, email: true, avatarUrl: true } }),
    ]);
    return {
      round: { id: round.id, name: round.name, isOpen: round.isOpen },
      teams: teamIds.length,
      judges: users.map((u) => ({
        judge: u,
        scored: submitted.filter((s) => s.judgeId === u.id).length,
        total: totals.get(u.id) ?? 0,
      })),
    };
  });

  // ───────── Judges ─────────
  app.get<{ Params: { id: string } }>("/events/:id/judges", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const assignments = await prisma.judgeAssignment.findMany({
      where: { eventId: event.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        team: { select: { id: true, name: true } },
        round: { select: { id: true, name: true } },
      },
    });
    const scored = await prisma.score.groupBy({
      by: ["judgeId", "teamId", "roundId"],
      where: { round: { eventId: event.id }, submittedAt: { not: null } },
    });
    const byJudge = new Map<string, { user: (typeof assignments)[number]["user"]; assignments: typeof assignments; submittedScorecards: number }>();
    for (const a of assignments) {
      const entry = byJudge.get(a.userId) ?? { user: a.user, assignments: [], submittedScorecards: scored.filter((s) => s.judgeId === a.userId).length };
      entry.assignments.push(a);
      byJudge.set(a.userId, entry);
    }
    return [...byJudge.values()];
  });

  app.post<{ Params: { id: string } }>("/events/:id/judges", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().optional(),
        roundId: z.string().optional(),
        teamIds: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const email = body.email.toLowerCase();
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { email, name: body.name ?? email.split("@")[0] } }));

    const membership = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: event.tenantId, userId: user.id } } });
    if (!membership) {
      await prisma.membership.create({ data: { tenantId: event.tenantId, userId: user.id, role: "JUDGE" } });
    } else if (membership.role === "STUDENT") {
      await prisma.membership.update({ where: { id: membership.id }, data: { role: "JUDGE" } });
    }

    await assertRoundOfEvent(event.id, body.roundId);
    const teamIds = body.teamIds?.length ? body.teamIds : [null];
    if (body.teamIds?.length) await assertTeamsOfEvent(event.id, body.teamIds);
    // NULL columns don't collide in Postgres unique indexes, so check for duplicates manually.
    for (const teamId of teamIds) {
      const exists = await prisma.judgeAssignment.findFirst({
        where: { eventId: event.id, userId: user.id, roundId: body.roundId ?? null, teamId },
      });
      if (!exists) {
        await prisma.judgeAssignment.create({ data: { eventId: event.id, userId: user.id, roundId: body.roundId ?? null, teamId } });
      }
    }
    await logActivity(event.id, req.auth!.user.id, "judge.added", { userId: user.id, name: user.name });
    // Invitation with a link to the scoring page (once per judge per event).
    const links = await eventLinks(event);
    await enqueue({
      tenantId: event.tenantId, eventId: event.id, userId: user.id, channels: ["EMAIL", "IN_APP"], template: "judge.invited",
      subject: `You're a judge for ${event.title}`,
      body: `Hi ${user.name.split(" ")[0]},\n\nYou've been added as a judge for ${event.title} (${fmtDate(event.startsAt)}).\n\nOn the day, open the judging page, sign in with this email (${user.email}), pick a team and give marks for each question. You can save as you go and submit when you're done.`,
      ctaLabel: "Open judging", ctaUrl: `${links.base}/judge/${event.slug}`,
      dedupKey: `judge.invited:${event.id}:${user.id}`,
    }).catch(() => {});
    const assignments = await prisma.judgeAssignment.findMany({ where: { eventId: event.id, userId: user.id } });
    return reply.status(201).send({ user, assignments });
  });

  app.delete<{ Params: { assignmentId: string } }>("/judges/:assignmentId", async (req) => {
    const a = await prisma.judgeAssignment.findUnique({ where: { id: req.params.assignmentId }, include: { event: true } });
    if (!a || a.event.tenantId !== requireTenant(req).id) throw notFound("Judge assignment");
    if (!(await canManageEvent(req, a.event))) throw forbidden();
    await prisma.judgeAssignment.delete({ where: { id: a.id } });
    return { ok: true };
  });

  // ───────── Judge (web + mobile) ─────────
  app.get("/judge/events", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const events = await prisma.event.findMany({
      where: { tenantId: tenant.id, judges: { some: { userId: user.id } } },
      orderBy: { startsAt: "desc" },
      include: {
        rounds: { orderBy: { sortOrder: "asc" } },
        rubric: { orderBy: { sortOrder: "asc" } },
        category: CATEGORY_SELECT,
      },
    });
    return Promise.all(
      events.map(async (e) => {
        const roundId = await defaultRoundId(e.id);
        const submitted = roundId
          ? (await prisma.score.groupBy({ by: ["teamId"], where: { roundId, judgeId: user.id, submittedAt: { not: null } } })).length
          : 0;
        const allowed = roundId ? await judgeTeamIds(e.id, user.id, roundId) : [];
        return {
          id: e.id, slug: e.slug, title: e.title, type: e.type, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt,
          coverImageUrl: e.coverImageUrl, ...eventMeta(e), rounds: e.rounds, rubric: e.rubric.filter((c) => !c.roundId || c.roundId === roundId),
          currentRoundId: roundId,
          assignedTeams: allowed.length,
          submittedTeams: submitted,
        };
      }),
    );
  });

  const judgeView = async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const q = z.object({ roundId: z.string().optional() }).parse(req.query);
    const isJudge = await prisma.judgeAssignment.findFirst({ where: { eventId: event.id, userId: user.id } });
    if (!isJudge && !(await canManageEvent(req, event))) throw forbidden("You're not a judge for this event");
    const roundId = q.roundId ?? (await defaultRoundId(event.id));
    if (!roundId) throw badRequest("This event has no judging rounds");
    const round = await prisma.judgingRound.findFirst({ where: { id: roundId, eventId: event.id } });
    if (!round) throw notFound("Round");

    const allowed = await judgeTeamIds(event.id, user.id, roundId);
    const category = event.categoryId
      ? await prisma.eventCategory.findUnique({ where: { id: event.categoryId }, select: CATEGORY_SELECT.select })
      : null;
    const [teams, rubric, scores, reviews, rounds, comments] = await Promise.all([
      prisma.team.findMany({
        where: { eventId: event.id, id: { in: allowed } },
        orderBy: { name: "asc" },
        include: {
          members: { include: { user: { select: { id: true, name: true, avatarUrl: true, githubUrl: true, linkedinUrl: true } } }, orderBy: { joinedAt: "asc" } },
          problemStatement: { select: { id: true, code: true, title: true, trackId: true } },
        },
      }),
      criteriaForRound(event.id, roundId),
      prisma.score.findMany({ where: { roundId, judgeId: user.id } }),
      prisma.judgeReview.findMany({ where: { roundId, judgeId: user.id } }),
      prisma.judgingRound.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" } }),
      judgeComments(event.tenantId, event.config),
    ]);

    return {
      event: {
        id: event.id, slug: event.slug, title: event.title, type: event.type, status: event.status, config: event.config,
        ...eventMeta({ ...event, category }),
      },
      round,
      rounds,
      rubric,
      criteria: rubric,
      comments,
      teams: teams.map((t) => {
        const mine = scores.filter((s) => s.teamId === t.id);
        const review = reviews.find((r) => r.teamId === t.id) ?? null;
        const done = mine.length > 0 && mine.every((s) => s.submittedAt) && rubric.every((c) => mine.some((s) => s.criterionId === c.id));
        const status = !mine.length && !review ? "NOT_STARTED" : done ? "SUBMITTED" : "DRAFT";
        return {
          id: t.id, name: t.name, trackId: t.trackId,
          projectTitle: t.projectTitle, projectSummary: t.projectSummary,
          repoUrl: t.repoUrl, demoUrl: t.demoUrl, deckUrl: t.deckUrl, videoUrl: t.videoUrl, submittedAt: t.submittedAt,
          attachments: t.attachments, techStack: t.techStack, problemStatement: t.problemStatement,
          members: t.members.map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl, githubUrl: m.user.githubUrl, linkedinUrl: m.user.linkedinUrl, isLeader: m.isLeader })),
          myScores: mine.map((s) => ({ criterionId: s.criterionId, value: s.value, comment: s.comment, submittedAt: s.submittedAt })),
          myReview: review && { comment: review.comment, tags: review.tags, recommend: review.recommend, submittedAt: review.submittedAt },
          status,
        };
      }),
    };
  };
  app.get<{ Params: { id: string } }>("/judge/events/:id", judgeView);
  app.get<{ Params: { id: string } }>("/judge/events/:id/teams", judgeView);

  const saveScores = async (req: FastifyRequest) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const input = scoreWithReviewSchema.parse(req.body);

    const round = await prisma.judgingRound.findUnique({ where: { id: input.roundId }, include: { event: true } });
    if (!round || round.event.tenantId !== tenant.id) throw notFound("Round");
    if (!round.isOpen) throw badRequest("This judging round is not open");
    const team = await prisma.team.findFirst({ where: { id: input.teamId, eventId: round.eventId } });
    if (!team) throw notFound("Team");
    const allowed = await judgeTeamIds(round.eventId, user.id, round.id);
    if (!allowed.includes(team.id)) throw forbidden("You're not assigned to judge this team in this round");

    const rubric = await criteriaForRound(round.eventId, round.id);
    const byId = new Map(rubric.map((c) => [c.id, c]));
    for (const s of input.scores) {
      const c = byId.get(s.criterionId);
      if (!c) throw badRequest("That criterion isn't used in this round");
      if (s.value > c.maxScore) throw badRequest(`${c.name}: score can't be more than ${c.maxScore}`);
    }

    const where = { roundId: round.id, teamId: team.id, judgeId: user.id };
    const [existing, existingReview] = await Promise.all([
      prisma.score.findMany({ where }),
      prisma.judgeReview.findUnique({ where: { roundId_teamId_judgeId: where } }),
    ]);
    if (existing.some((s) => s.submittedAt) || existingReview?.submittedAt) throw conflict("You've already submitted scores for this team");

    const covered = new Set([...existing.map((s) => s.criterionId), ...input.scores.map((s) => s.criterionId)]);
    if (input.submit && rubric.some((c) => !covered.has(c.id))) throw badRequest("Score every criterion before submitting");

    const now = new Date();
    const reviewData = {
      ...(input.review?.comment !== undefined && { comment: input.review.comment || null }),
      ...(input.review?.tags !== undefined && { tags: [...new Set(input.review.tags)] }),
      ...(input.review?.recommend !== undefined && { recommend: input.review.recommend }),
    };
    const ops: Prisma.PrismaPromise<unknown>[] = input.scores.map((s) =>
      prisma.score.upsert({
        where: { roundId_teamId_judgeId_criterionId: { ...where, criterionId: s.criterionId } },
        create: { ...where, criterionId: s.criterionId, value: s.value, comment: s.comment },
        update: { value: s.value, comment: s.comment },
      }),
    );
    if (input.review || input.submit) {
      ops.push(
        prisma.judgeReview.upsert({
          where: { roundId_teamId_judgeId: where },
          create: { ...where, eventId: round.eventId, ...reviewData, ...(input.submit && { submittedAt: now }) },
          update: { ...reviewData, ...(input.submit && { submittedAt: now }) },
        }),
      );
    }
    if (input.submit) ops.push(prisma.score.updateMany({ where, data: { submittedAt: now } }));
    await prisma.$transaction(ops);
    if (input.submit) {
      await logActivity(round.eventId, user.id, "scores.submitted", { teamId: team.id, team: team.name, round: round.name });
    }
    const [scores, review] = await Promise.all([
      prisma.score.findMany({ where }),
      prisma.judgeReview.findUnique({ where: { roundId_teamId_judgeId: where } }),
    ]);
    return { scores, review, submitted: !!input.submit };
  };
  app.put("/judge/scores", saveScores);
  app.post("/judge/scores", saveScores);

  // ───────── Leaderboard & results ─────────
  app.get<{ Params: { id: string } }>("/events/:id/leaderboard", async (req) => {
    const event = await findEvent(req, req.params.id);
    const manager = await canManageEvent(req, event);
    if (!manager && !event.resultsPublishedAt) throw forbidden("Results haven't been published yet");
    const q = z.object({ roundId: z.string().optional() }).parse(req.query);
    const roundId = q.roundId ?? (await defaultRoundId(event.id));
    if (q.roundId) await assertRoundOfEvent(event.id, q.roundId);
    const rows = await computeLeaderboard(event.id, roundId, { withRemarks: manager });
    const round = roundId ? await prisma.judgingRound.findUnique({ where: { id: roundId } }) : null;
    return {
      roundId,
      round: round && { id: round.id, name: round.name, isOpen: round.isOpen, closedAt: round.closedAt, restrictTeams: round.restrictTeams },
      resultsPublishedAt: event.resultsPublishedAt,
      rows,
    };
  });

  /**
   * Public leaderboard (event page and app), once results are published.
   * Ranks always show; scores only if the organiser turned on config.leaderboard.showScores; config.leaderboard.hidden hides it.
   * Final standings follow the published ranks/awards, then the judges' scores of the last round; ?roundId= shows one round.
   * Events without judging (quiz, coding contest) list the teams/participants by the ranks the organiser entered.
   */
  app.get<{ Params: { id: string } }>("/events/:id/standings", async (req) => {
    const event = await findEvent(req, req.params.id);
    const manager = await canManageEvent(req, event);
    const cfg = ((event.config ?? {}) as { leaderboard?: { hidden?: boolean; showScores?: boolean } }).leaderboard ?? {};
    if (!event.resultsPublishedAt && !manager) return { published: false, rows: [], rounds: [] };
    if (cfg.hidden && !manager) return { published: true, hidden: true, rows: [], rounds: [] };
    const showScores = !!cfg.showScores || manager;
    const q = z.object({ roundId: z.string().optional() }).parse(req.query);

    const [teams, rounds, scoredRounds] = await Promise.all([
      prisma.team.findMany({
        where: { eventId: event.id },
        include: { members: { include: { user: { select: { name: true, avatarUrl: true } } }, orderBy: { joinedAt: "asc" } } },
      }),
      prisma.judgingRound.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      prisma.score.groupBy({ by: ["roundId"], where: { team: { eventId: event.id }, submittedAt: { not: null } } }),
    ]);
    const scored = rounds.filter((r) => scoredRounds.some((s) => s.roundId === r.id));
    const byTeam = new Map(teams.map((t) => [t.id, t]));
    if (q.roundId && !scored.some((r) => r.id === q.roundId)) throw notFound("Round");
    const roundId = q.roundId ?? scored[scored.length - 1]?.id ?? null;
    const board = roundId ? await computeLeaderboard(event.id, roundId) : [];
    const boardBy = new Map(board.map((r) => [r.team.id, r]));

    type Row = { rank: number | null; teamId: string; teamName: string; projectTitle: string | null; award: string | null; members: { name: string; avatarUrl: string | null }[]; score: number | null; criteria?: { name: string; average: number | null; maxScore: number }[] };
    const toRow = (teamId: string, rank: number | null): Row => {
      const t = byTeam.get(teamId)!;
      const b = boardBy.get(teamId);
      return {
        rank, teamId, teamName: t.name, projectTitle: t.projectTitle, award: t.award,
        members: t.members.map((m) => ({ name: m.user.name, avatarUrl: m.user.avatarUrl })),
        score: showScores && b && b.judgesScored ? b.total : null,
        ...(showScores && b && b.judgesScored && { criteria: b.criteria.map((c) => ({ name: c.name, average: c.average, maxScore: c.maxScore })) }),
      };
    };

    let rows: Row[];
    if (q.roundId) {
      // One round: the judges' ranking.
      rows = board.filter((r) => r.judgesScored).map((r) => toRow(r.team.id, r.rank));
    } else {
      // Final: published ranks first, then awards, then the last round's scores.
      const placed = teams.filter((t) => t.rank != null || t.award).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
      const rest = board.filter((r) => r.judgesScored && !placed.some((t) => t.id === r.team.id));
      rows = [...placed.map((t) => t.id), ...rest.map((r) => r.team.id)].map((id, i) => toRow(id, byTeam.get(id)!.rank ?? i + 1));
    }
    return {
      published: true,
      showScores,
      round: q.roundId ? scored.find((r) => r.id === q.roundId) ?? null : null,
      rounds: scored,
      totalTeams: teams.length,
      rows,
    };
  });

  /**
   * Publishes results. Body: `{ results: [{ teamId, rank?, award? }], finalists?: teamId[] }`
   * (the older `{ awards: [{ teamId, award, rank? }] }` is still accepted).
   */
  app.post<{ Params: { id: string } }>("/events/:id/results", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        results: z.array(z.object({ teamId: z.string(), rank: z.number().int().min(1).optional(), award: z.enum(AWARDS).optional() })).optional(),
        awards: z.array(z.object({ teamId: z.string(), award: z.enum(AWARDS), rank: z.number().int().min(1).optional() })).optional(),
        finalists: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const results = body.results ?? body.awards ?? [];
    await assertTeamsOfEvent(event.id, results.map((a) => a.teamId));
    if (body.finalists) await assertTeamsOfEvent(event.id, body.finalists);

    const publishedAt = new Date();
    await prisma.$transaction([
      prisma.team.updateMany({ where: { eventId: event.id }, data: { award: null, rank: null } }),
      ...results.map((a) => prisma.team.update({ where: { id: a.teamId }, data: { award: a.award ?? null, rank: a.rank ?? null } })),
      prisma.event.update({
        where: { id: event.id },
        data: {
          resultsPublishedAt: publishedAt,
          ...(body.finalists && { config: { ...((event.config ?? {}) as object), finalistTeamIds: [...new Set(body.finalists)] } }),
        },
      }),
    ]);
    await logActivity(event.id, req.auth!.user.id, "results.published", { results: results.length, finalists: body.finalists?.length ?? 0 });
    safely("results.published", () => notifyResults(event.id, publishedAt));
    return prisma.team.findMany({ where: { eventId: event.id, OR: [{ award: { not: null } }, { rank: { not: null } }] }, orderBy: { rank: "asc" } });
  });
}
