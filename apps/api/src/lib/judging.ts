import type { JudgingRound, RubricCriterion } from "@prisma/client";
import { prisma } from "../plugins/prisma";

export interface LeaderboardRow {
  team: { id: string; name: string; projectTitle: string | null; trackId: string | null; award: string | null };
  /** 0–100: average across judges of sum(value/maxScore × weight) / sum(weight) × 100 */
  avgWeighted: number;
  /** Same as avgWeighted (out of 100) */
  total: number;
  criteria: { criterionId: string; name: string; maxScore: number; weight: number; average: number | null }[];
  judgesScored: number;
  judgesAssigned: number;
  recommendCount: number;
  /** Judges' remarks with names (staff only) */
  remarks?: { judgeId: string; judgeName: string; comment: string | null; tags: string[]; recommend: boolean | null; submitted: boolean }[];
  rank: number;
}

/** Default round: the open one, else the most recently closed one, else the first by order. */
export async function defaultRoundId(eventId: string): Promise<string | null> {
  const rounds = await prisma.judgingRound.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  const open = rounds.find((r) => r.isOpen);
  if (open) return open.id;
  const closed = rounds.filter((r) => r.closedAt).sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
  return (closed[0] ?? rounds[0])?.id ?? null;
}

/** Criteria used in a round: event-wide ones plus the round's own. */
export async function criteriaForRound(eventId: string, roundId: string | null): Promise<RubricCriterion[]> {
  return prisma.rubricCriterion.findMany({
    where: { eventId, OR: [{ roundId: null }, ...(roundId ? [{ roundId }] : [])] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Teams judged in a round: the shortlist when the round is restricted, else every team of the event. */
export async function roundTeamIds(round: Pick<JudgingRound, "id" | "eventId" | "restrictTeams">): Promise<string[]> {
  if (round.restrictTeams) {
    return (await prisma.roundTeam.findMany({ where: { roundId: round.id }, select: { teamId: true } })).map((t) => t.teamId);
  }
  return (await prisma.team.findMany({ where: { eventId: round.eventId }, select: { id: true } })).map((t) => t.id);
}

/**
 * Teams a judge may score in a round: their assignments (teamId null = every team) intersected with the round's teams.
 * Returns [] when the judge isn't assigned.
 */
export async function judgeTeamIds(eventId: string, judgeId: string, roundId: string): Promise<string[]> {
  const [assignments, round] = await Promise.all([
    prisma.judgeAssignment.findMany({ where: { eventId, userId: judgeId, OR: [{ roundId }, { roundId: null }] } }),
    prisma.judgingRound.findUnique({ where: { id: roundId } }),
  ]);
  if (!assignments.length || !round) return [];
  const inRound = await roundTeamIds(round);
  if (assignments.some((a) => a.teamId === null)) return inRound;
  const mine = new Set(assignments.map((a) => a.teamId!).filter(Boolean));
  return inRound.filter((id) => mine.has(id));
}

/** Judges expected to score each team in a round (distinct user ids per team). */
export async function judgesPerTeam(eventId: string, roundId: string, teamIds: string[]): Promise<Map<string, Set<string>>> {
  const assignments = await prisma.judgeAssignment.findMany({ where: { eventId, OR: [{ roundId }, { roundId: null }] } });
  const map = new Map<string, Set<string>>(teamIds.map((id) => [id, new Set<string>()]));
  for (const a of assignments) {
    const targets = a.teamId ? (map.has(a.teamId) ? [a.teamId] : []) : teamIds;
    for (const t of targets) map.get(t)!.add(a.userId);
  }
  return map;
}

export async function computeLeaderboard(
  eventId: string,
  roundId: string | null,
  opts: { withRemarks?: boolean } = {},
): Promise<LeaderboardRow[]> {
  const round = roundId ? await prisma.judgingRound.findFirst({ where: { id: roundId, eventId } }) : null;
  const teamIds = round ? await roundTeamIds(round) : null;
  const [teams, criteria] = await Promise.all([
    prisma.team.findMany({ where: { eventId, ...(teamIds && { id: { in: teamIds } }) }, orderBy: { name: "asc" } }),
    criteriaForRound(eventId, round?.id ?? null),
  ]);
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const byId = new Map(criteria.map((c) => [c.id, c]));

  const [scores, reviews, expected] = round
    ? await Promise.all([
        prisma.score.findMany({ where: { roundId: round.id, submittedAt: { not: null }, team: { eventId } } }),
        prisma.judgeReview.findMany({ where: { roundId: round.id }, include: { judge: { select: { id: true, name: true } } } }),
        judgesPerTeam(eventId, round.id, teams.map((t) => t.id)),
      ])
    : [[], [], new Map<string, Set<string>>()];

  // team -> judge -> weighted sum; team -> criterion -> values
  const perTeam = new Map<string, Map<string, number>>();
  const perCriterion = new Map<string, Map<string, number[]>>();
  for (const s of scores) {
    const c = byId.get(s.criterionId);
    if (!c || c.maxScore <= 0) continue;
    const judges = perTeam.get(s.teamId) ?? new Map<string, number>();
    judges.set(s.judgeId, (judges.get(s.judgeId) ?? 0) + (s.value / c.maxScore) * c.weight);
    perTeam.set(s.teamId, judges);
    const crit = perCriterion.get(s.teamId) ?? new Map<string, number[]>();
    crit.set(c.id, [...(crit.get(c.id) ?? []), s.value]);
    perCriterion.set(s.teamId, crit);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rows: LeaderboardRow[] = teams.map((t) => {
    const judges = perTeam.get(t.id);
    const values = judges ? [...judges.values()].map((v) => (v / totalWeight) * 100) : [];
    const avg = round2(values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    const crit = perCriterion.get(t.id);
    const teamReviews = reviews.filter((r) => r.teamId === t.id);
    return {
      team: { id: t.id, name: t.name, projectTitle: t.projectTitle, trackId: t.trackId, award: t.award },
      avgWeighted: avg,
      total: avg,
      criteria: criteria.map((c) => {
        const v = crit?.get(c.id);
        return { criterionId: c.id, name: c.name, maxScore: c.maxScore, weight: c.weight, average: v?.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null };
      }),
      judgesScored: values.length,
      judgesAssigned: expected.get(t.id)?.size ?? 0,
      recommendCount: teamReviews.filter((r) => r.recommend && r.submittedAt).length,
      ...(opts.withRemarks && {
        remarks: teamReviews
          .filter((r) => r.comment || r.tags.length || r.recommend !== null)
          .map((r) => ({ judgeId: r.judgeId, judgeName: r.judge.name, comment: r.comment, tags: r.tags, recommend: r.recommend, submitted: !!r.submittedAt })),
      }),
      rank: 0,
    };
  });

  rows.sort((a, b) => b.avgWeighted - a.avgWeighted || b.judgesScored - a.judgesScored || b.recommendCount - a.recommendCount);
  // Competition ranking: equal scores share a rank.
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].avgWeighted === r.avgWeighted ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
