// Normalisers for judging payloads. The v1.2 contract describes these responses in prose, so accept the
// likely field spellings and degrade gracefully.
import { DEFAULT_CRITERIA_LIBRARY, DEFAULT_JUDGE_COMMENTS } from "@elevate/shared";
import type { LibraryComment, LibraryCriterion, Round, Team } from "./types";

type Obj = Record<string, unknown>;
const num = (...v: unknown[]): number | undefined => {
  for (const x of v) if (typeof x === "number" && Number.isFinite(x)) return x;
  return undefined;
};
const str = (...v: unknown[]): string | undefined => {
  for (const x of v) if (typeof x === "string" && x) return x;
  return undefined;
};

export interface BoardCriterion { id?: string; name: string; avg: number; maxScore?: number }
export interface BoardRemark { judgeName?: string; comment?: string; tags: string[]; recommend?: boolean | null }
export interface BoardRow {
  team: Team; rank: number; total: number; criteria: BoardCriterion[];
  judgesDone: number; judgesAssigned?: number; recommendCount: number; remarks: BoardRemark[];
}

export function normalizeBoard(raw: unknown): BoardRow[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? ((raw as Obj).rows ?? (raw as Obj).items ?? (raw as Obj).teams ?? (raw as Obj).leaderboard) : null;
  if (!Array.isArray(list)) return [];
  const rows = (list as Obj[]).map((r, i): BoardRow => {
    const team = (r.team as Team | undefined) ?? ({ id: str(r.teamId) ?? String(i), name: str(r.teamName, r.name) ?? "Team", eventId: "" } as Team);
    const critRaw = r.criteria ?? r.perCriterion ?? r.criteriaAverages ?? r.criterionAverages;
    let criteria: BoardCriterion[] = [];
    if (Array.isArray(critRaw)) {
      criteria = (critRaw as Obj[]).map((c) => ({
        id: str(c.criterionId, c.id),
        name: str(c.name, (c.criterion as Obj | undefined)?.name) ?? "Criterion",
        avg: num(c.avg, c.average, c.value, c.score) ?? 0,
        maxScore: num(c.maxScore, (c.criterion as Obj | undefined)?.maxScore),
      }));
    } else if (critRaw && typeof critRaw === "object") {
      criteria = Object.entries(critRaw as Obj).map(([name, v]) => (typeof v === "number" ? { name, avg: v } : { name, avg: num((v as Obj).avg, (v as Obj).average) ?? 0, maxScore: num((v as Obj).maxScore) }));
    }
    const remarksRaw = (r.remarks ?? r.reviews ?? r.comments) as unknown;
    const remarks: BoardRemark[] = Array.isArray(remarksRaw)
      ? (remarksRaw as unknown[]).map((x) => (typeof x === "string" ? { comment: x, tags: [] } : {
        judgeName: str((x as Obj).judgeName, ((x as Obj).judge as Obj | undefined)?.name),
        comment: str((x as Obj).comment, (x as Obj).text),
        tags: Array.isArray((x as Obj).tags) ? ((x as Obj).tags as string[]) : [],
        recommend: (x as Obj).recommend as boolean | null | undefined,
      }))
      : [];
    return {
      team,
      rank: num(r.rank) ?? i + 1,
      total: num(r.total, r.weightedTotal, r.score, r.avgWeighted) ?? 0,
      criteria,
      judgesDone: num(r.judgesDone, r.judgesScored) ?? 0,
      judgesAssigned: num(r.judgesAssigned, r.judgesTotal),
      recommendCount: num(r.recommendCount, r.recommends) ?? remarks.filter((x) => x.recommend).length,
      remarks,
    };
  });
  return rows.sort((a, b) => a.rank - b.rank || b.total - a.total);
}

export interface JudgeProgress { judgeId?: string; name: string; email?: string; scored: number; total: number }

export function normalizeProgress(raw: unknown): JudgeProgress[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? ((raw as Obj).judges ?? (raw as Obj).items ?? (raw as Obj).progress) : null;
  if (!Array.isArray(list)) return [];
  return (list as Obj[]).map((p) => {
    const judge = (p.judge ?? p.user) as Obj | undefined;
    return {
      judgeId: str(p.judgeId, p.userId, judge?.id),
      name: str(p.judgeName, p.name, judge?.name, judge?.email) ?? "Judge",
      email: str(p.email, judge?.email),
      scored: num(p.scored, p.teamsScored, p.done, p.submitted) ?? 0,
      total: num(p.total, p.teamsTotal, p.assigned, p.teams) ?? 0,
    };
  });
}

/** Team ids shortlisted for a round, whatever shape the round carries them in. */
export function roundTeamIds(r: Round): string[] {
  if (Array.isArray(r.teamIds)) return r.teamIds;
  if (Array.isArray(r.teams)) return r.teams.map((t) => ("teamId" in t ? t.teamId : t.id)).filter(Boolean);
  return [];
}

export interface Library { criteria: LibraryCriterion[]; comments: { id?: string; text: string; category: string; builtIn: boolean }[] }

export function normalizeLibrary(raw: unknown): Library {
  const d = (raw && typeof raw === "object" ? raw : {}) as { criteria?: LibraryCriterion[]; comments?: LibraryComment[] };
  const criteria = Array.isArray(d.criteria) && d.criteria.length
    ? d.criteria.map((c) => ({ ...c, builtIn: c.builtIn ?? !c.id }))
    : DEFAULT_CRITERIA_LIBRARY.map((c) => ({ ...c, builtIn: true }));
  const comments = Array.isArray(d.comments) && d.comments.length
    ? d.comments.map((c) => ({ id: c.id, text: c.text ?? c.name ?? "", category: c.category ?? "Other", builtIn: c.builtIn ?? !c.id })).filter((c) => c.text)
    : DEFAULT_JUDGE_COMMENTS.map((c) => ({ text: c.text, category: c.category, builtIn: true }));
  return { criteria, comments };
}
