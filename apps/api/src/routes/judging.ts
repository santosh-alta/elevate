import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scoreInputSchema } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canManageEvent, findEvent, requireEventManager, requireUser } from "../lib/permissions";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { computeLeaderboard, defaultRoundId, judgeTeamIds } from "../lib/judging";
import { logActivity } from "../lib/activity";

export function judgingRoutes(app: FastifyInstance) {
  // ───────── Rubric ─────────
  app.get<{ Params: { id: string } }>("/events/:id/rubric", async (req) => {
    const event = await findEvent(req, req.params.id);
    return prisma.rubricCriterion.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" } });
  });

  app.put<{ Params: { id: string } }>("/events/:id/rubric", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const items = z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          description: z.string().optional(),
          maxScore: z.number().int().min(1).max(100),
          weight: z.number().min(0).max(10).default(1),
        }),
      )
      .min(1)
      .parse(req.body);

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
        const data = { name: item.name, description: item.description, maxScore: item.maxScore, weight: item.weight, sortOrder: i };
        return item.id && current.some((c) => c.id === item.id)
          ? prisma.rubricCriterion.update({ where: { id: item.id }, data })
          : prisma.rubricCriterion.create({ data: { ...data, eventId: event.id } });
      }),
    ]);
    await logActivity(event.id, req.auth!.user.id, "rubric.updated", { criteria: items.length });
    return prisma.rubricCriterion.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" } });
  });

  // ───────── Rounds ─────────
  app.get<{ Params: { id: string } }>("/events/:id/rounds", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.judgingRound.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" } });
  });

  app.post<{ Params: { id: string } }>("/events/:id/rounds", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const last = await prisma.judgingRound.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: "desc" } });
    const round = await prisma.judgingRound.create({ data: { eventId: event.id, name, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    return reply.status(201).send(round);
  });

  app.patch<{ Params: { roundId: string } }>("/rounds/:roundId", async (req) => {
    const round = await prisma.judgingRound.findUnique({ where: { id: req.params.roundId }, include: { event: true } });
    if (!round || round.event.tenantId !== requireTenant(req).id) throw notFound("Round");
    if (!(await canManageEvent(req, round.event))) throw forbidden();
    const body = z.object({ isOpen: z.boolean().optional(), name: z.string().min(1).optional() }).parse(req.body);
    const updated = await prisma.judgingRound.update({
      where: { id: round.id },
      data: {
        ...body,
        ...(body.isOpen === false && round.isOpen && { closedAt: new Date() }),
        ...(body.isOpen === true && { closedAt: null }),
      },
    });
    if (body.isOpen !== undefined && body.isOpen !== round.isOpen) {
      await logActivity(round.eventId, req.auth!.user.id, body.isOpen ? "round.opened" : "round.closed", { roundId: round.id, name: round.name });
    }
    return updated;
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
      by: ["judgeId", "teamId"],
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

    if (body.roundId) {
      const round = await prisma.judgingRound.findFirst({ where: { id: body.roundId, eventId: event.id } });
      if (!round) throw badRequest("Unknown round");
    }
    const teamIds = body.teamIds?.length ? body.teamIds : [null];
    if (body.teamIds?.length) {
      const n = await prisma.team.count({ where: { eventId: event.id, id: { in: body.teamIds } } });
      if (n !== new Set(body.teamIds).size) throw badRequest("One or more teams don't belong to this event");
    }
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

  // ───────── Judge (mobile) ─────────
  app.get("/judge/events", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const events = await prisma.event.findMany({
      where: { tenantId: tenant.id, judges: { some: { userId: user.id } } },
      orderBy: { startsAt: "desc" },
      include: {
        rounds: { orderBy: { sortOrder: "asc" } },
        rubric: { orderBy: { sortOrder: "asc" } },
        _count: { select: { teams: true } },
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
          coverImageUrl: e.coverImageUrl, rounds: e.rounds, rubric: e.rubric, currentRoundId: roundId,
          assignedTeams: allowed === "ALL" ? e._count.teams : allowed.length,
          submittedTeams: submitted,
        };
      }),
    );
  });

  app.get<{ Params: { id: string } }>("/judge/events/:id/teams", async (req) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const q = z.object({ roundId: z.string().optional() }).parse(req.query);
    const roundId = q.roundId ?? (await defaultRoundId(event.id));
    if (!roundId) throw badRequest("This event has no judging rounds");
    const round = await prisma.judgingRound.findFirst({ where: { id: roundId, eventId: event.id } });
    if (!round) throw notFound("Round");

    const allowed = await judgeTeamIds(event.id, user.id, roundId);
    if (allowed !== "ALL" && !allowed.length) throw forbidden("You're not a judge for this event");

    const [teams, rubric, scores, rounds] = await Promise.all([
      prisma.team.findMany({
        where: { eventId: event.id, ...(allowed !== "ALL" && { id: { in: allowed } }) },
        orderBy: { name: "asc" },
        include: { members: { include: { user: { select: { id: true, name: true } } } } },
      }),
      prisma.rubricCriterion.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" } }),
      prisma.score.findMany({ where: { roundId, judgeId: user.id } }),
      prisma.judgingRound.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" } }),
    ]);

    return {
      event: { id: event.id, title: event.title, status: event.status, config: event.config },
      round,
      rounds,
      rubric,
      teams: teams.map((t) => {
        const mine = scores.filter((s) => s.teamId === t.id);
        const status = !mine.length ? "NOT_STARTED" : mine.every((s) => s.submittedAt) && mine.length >= rubric.length ? "SUBMITTED" : "DRAFT";
        return {
          id: t.id, name: t.name, trackId: t.trackId,
          projectTitle: t.projectTitle, projectSummary: t.projectSummary,
          repoUrl: t.repoUrl, demoUrl: t.demoUrl, deckUrl: t.deckUrl, videoUrl: t.videoUrl, submittedAt: t.submittedAt,
          members: t.members.map((m) => ({ id: m.user.id, name: m.user.name, isLeader: m.isLeader })),
          myScores: mine.map((s) => ({ criterionId: s.criterionId, value: s.value, comment: s.comment, submittedAt: s.submittedAt })),
          status,
        };
      }),
    };
  });

  app.put("/judge/scores", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const input = scoreInputSchema.parse(req.body);

    const round = await prisma.judgingRound.findUnique({ where: { id: input.roundId }, include: { event: true } });
    if (!round || round.event.tenantId !== tenant.id) throw notFound("Round");
    if (!round.isOpen) throw badRequest("This judging round is not open");
    const team = await prisma.team.findFirst({ where: { id: input.teamId, eventId: round.eventId } });
    if (!team) throw notFound("Team");
    const allowed = await judgeTeamIds(round.eventId, user.id, round.id);
    if (allowed !== "ALL" && !allowed.includes(team.id)) throw forbidden("You're not assigned to judge this team");

    const rubric = await prisma.rubricCriterion.findMany({ where: { eventId: round.eventId } });
    const byId = new Map(rubric.map((c) => [c.id, c]));
    for (const s of input.scores) {
      const c = byId.get(s.criterionId);
      if (!c) throw badRequest("Unknown criterion");
      if (s.value > c.maxScore) throw badRequest(`${c.name}: score can't be more than ${c.maxScore}`);
    }

    const existing = await prisma.score.findMany({ where: { roundId: round.id, teamId: team.id, judgeId: user.id } });
    if (existing.some((s) => s.submittedAt)) throw conflict("You've already submitted scores for this team");

    const covered = new Set([...existing.map((s) => s.criterionId), ...input.scores.map((s) => s.criterionId)]);
    if (input.submit && rubric.some((c) => !covered.has(c.id))) throw badRequest("Score every criterion before submitting");

    const now = new Date();
    await prisma.$transaction([
      ...input.scores.map((s) =>
        prisma.score.upsert({
          where: { roundId_teamId_judgeId_criterionId: { roundId: round.id, teamId: team.id, judgeId: user.id, criterionId: s.criterionId } },
          create: { roundId: round.id, teamId: team.id, judgeId: user.id, criterionId: s.criterionId, value: s.value, comment: s.comment },
          update: { value: s.value, comment: s.comment },
        }),
      ),
      ...(input.submit
        ? [prisma.score.updateMany({ where: { roundId: round.id, teamId: team.id, judgeId: user.id }, data: { submittedAt: now } })]
        : []),
    ]);
    if (input.submit) {
      await logActivity(round.eventId, user.id, "scores.submitted", { teamId: team.id, team: team.name, round: round.name });
    }
    const scores = await prisma.score.findMany({ where: { roundId: round.id, teamId: team.id, judgeId: user.id } });
    return { scores, submitted: !!input.submit };
  });

  // ───────── Leaderboard & results ─────────
  app.get<{ Params: { id: string } }>("/events/:id/leaderboard", async (req) => {
    const event = await findEvent(req, req.params.id);
    const manager = await canManageEvent(req, event);
    if (!manager && !event.resultsPublishedAt) throw forbidden("Results haven't been published yet");
    const q = z.object({ roundId: z.string().optional() }).parse(req.query);
    const roundId = q.roundId ?? (await defaultRoundId(event.id));
    const rows = await computeLeaderboard(event.id, roundId);
    return { roundId, resultsPublishedAt: event.resultsPublishedAt, rows };
  });

  app.post<{ Params: { id: string } }>("/events/:id/results", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { awards } = z
      .object({
        awards: z.array(
          z.object({
            teamId: z.string(),
            award: z.enum(["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP", "SPECIAL_MENTION"]),
            rank: z.number().int().min(1).optional(),
          }),
        ),
      })
      .parse(req.body);
    const ids = awards.map((a) => a.teamId);
    const n = await prisma.team.count({ where: { eventId: event.id, id: { in: ids } } });
    if (n !== new Set(ids).size) throw badRequest("One or more teams don't belong to this event");

    await prisma.$transaction([
      prisma.team.updateMany({ where: { eventId: event.id }, data: { award: null, rank: null } }),
      ...awards.map((a) => prisma.team.update({ where: { id: a.teamId }, data: { award: a.award, rank: a.rank ?? null } })),
      prisma.event.update({ where: { id: event.id }, data: { resultsPublishedAt: new Date() } }),
    ]);
    await logActivity(event.id, req.auth!.user.id, "results.published", { awards: awards.length });
    return prisma.team.findMany({ where: { eventId: event.id, award: { not: null } }, orderBy: { rank: "asc" } });
  });
}
