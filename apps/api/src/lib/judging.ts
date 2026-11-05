import { prisma } from "../plugins/prisma";

export interface LeaderboardRow {
  team: { id: string; name: string; projectTitle: string | null; trackId: string | null; award: string | null };
  /** 0–100: average across judges of sum(value/maxScore*weight)/sum(weight)*100 */
  avgWeighted: number;
  judgesScored: number;
  rank: number;
}

/** Default round: the open round, else the last one by sortOrder. */
export async function defaultRoundId(eventId: string): Promise<string | null> {
  const rounds = await prisma.judgingRound.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  return (rounds.find((r) => r.isOpen) ?? rounds.at(-1))?.id ?? null;
}

export async function computeLeaderboard(eventId: string, roundId: string | null): Promise<LeaderboardRow[]> {
  const [teams, criteria] = await Promise.all([
    prisma.team.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
    prisma.rubricCriterion.findMany({ where: { eventId } }),
  ]);
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const byId = new Map(criteria.map((c) => [c.id, c]));

  const scores = roundId
    ? await prisma.score.findMany({ where: { roundId, submittedAt: { not: null }, team: { eventId } } })
    : [];

  // team -> judge -> weighted sum
  const perTeam = new Map<string, Map<string, number>>();
  for (const s of scores) {
    const c = byId.get(s.criterionId);
    if (!c || c.maxScore <= 0) continue;
    const judges = perTeam.get(s.teamId) ?? new Map<string, number>();
    judges.set(s.judgeId, (judges.get(s.judgeId) ?? 0) + (s.value / c.maxScore) * c.weight);
    perTeam.set(s.teamId, judges);
  }

  const rows = teams.map((t) => {
    const judges = perTeam.get(t.id);
    const values = judges ? [...judges.values()].map((v) => (v / totalWeight) * 100) : [];
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
      team: { id: t.id, name: t.name, projectTitle: t.projectTitle, trackId: t.trackId, award: t.award },
      avgWeighted: Math.round(avg * 100) / 100,
      judgesScored: values.length,
      rank: 0,
    };
  });

  rows.sort((a, b) => b.avgWeighted - a.avgWeighted || b.judgesScored - a.judgesScored);
  // Competition ranking: equal scores share a rank.
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].avgWeighted === r.avgWeighted ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

/** Teams a judge may score in a round (assignment with teamId null = every team). */
export async function judgeTeamIds(eventId: string, judgeId: string, roundId: string): Promise<string[] | "ALL"> {
  const assignments = await prisma.judgeAssignment.findMany({
    where: { eventId, userId: judgeId, OR: [{ roundId }, { roundId: null }] },
  });
  if (!assignments.length) return [];
  if (assignments.some((a) => a.teamId === null)) return "ALL";
  return assignments.map((a) => a.teamId!).filter(Boolean);
}
