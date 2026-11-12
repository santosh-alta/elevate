import Link from "next/link";
import { Medal, Users } from "lucide-react";
import { humanize } from "@/lib/format";
import { cn } from "@/components/ui/cn";

export type Standings = {
  published: boolean; hidden?: boolean; showScores?: boolean; totalTeams?: number;
  round: { id: string; name: string } | null;
  rounds: { id: string; name: string }[];
  rows: {
    rank: number | null; teamId: string; teamName: string; projectTitle: string | null; award: string | null;
    members: { name: string; avatarUrl: string | null }[]; score: number | null;
    criteria?: { name: string; average: number | null; maxScore: number }[];
  }[];
};

const MEDAL: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950",
  2: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
  3: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950",
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** Event leaderboard: every team by rank, with members, project, award and (if the organiser allows) judges' scores. */
export function Leaderboard({ data, eventSlug }: { data: Standings; eventSlug: string }) {
  const tabs = [{ id: null as string | null, name: "Final standings" }, ...(data.rounds.length > 1 ? data.rounds.map((r) => ({ id: r.id as string | null, name: r.name })) : [])];
  const top = data.rows.reduce((m, r) => Math.max(m, r.score ?? 0), 0) || 100;
  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = (data.round?.id ?? null) === t.id;
            return (
              <Link key={t.id ?? "final"} scroll={false} href={`/events/${eventSlug}${t.id ? `?round=${t.id}` : ""}#leaderboard`}
                className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", active ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}>
                {t.name}
              </Link>
            );
          })}
        </div>
      )}
      <ol className="overflow-hidden rounded-brand border border-border bg-card shadow-soft">
        {data.rows.map((r, i) => (
          <li key={r.teamId} className={cn("flex items-center gap-4 px-4 py-3.5 sm:px-5", i > 0 && "border-t border-border", r.rank === 1 && "bg-amber-500/[0.06]")}>
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-heading text-base font-extrabold tabular-nums", r.rank && MEDAL[r.rank] ? MEDAL[r.rank] : "bg-bg text-fg/70")}>
              {r.rank ?? "–"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-heading text-base font-bold">{r.teamName}</p>
                {r.award && <span className="inline-flex items-center gap-1 rounded-full bg-highlight px-2 py-0.5 text-[11px] font-bold text-highlight-fg"><Medal className="h-3 w-3" />{humanize(r.award)}</span>}
              </div>
              {r.projectTitle && <p className="truncate text-sm text-fg/80">{r.projectTitle}</p>}
              {r.members.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex -space-x-1">
                    {r.members.slice(0, 5).map((m) => m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.name} src={m.avatarUrl} alt="" title={m.name} referrerPolicy="no-referrer" className="h-6 w-6 rounded-full object-cover ring-2 ring-card" />
                    ) : (
                      <span key={m.name} title={m.name} className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-fg ring-2 ring-card">{initials(m.name)}</span>
                    ))}
                  </div>
                  <span className="truncate text-xs text-muted">{r.members.map((m) => m.name.split(" ")[0]).join(", ")}</span>
                </div>
              )}
              {r.criteria && r.criteria.some((c) => c.average != null) && (
                <p className="mt-1 hidden text-[11px] text-muted sm:block">{r.criteria.filter((c) => c.average != null).map((c) => `${c.name} ${c.average}/${c.maxScore}`).join(" · ")}</p>
              )}
            </div>
            {r.score != null && (
              <div className="w-24 shrink-0 text-right sm:w-36">
                <p className="font-heading text-lg font-extrabold tabular-nums">{r.score}</p>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-fg/[0.06]"><span className="block h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(4, (r.score / top) * 100)}%` }} /></span>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Users className="h-3.5 w-3.5" />
        {data.totalTeams && data.totalTeams > data.rows.length ? `${data.rows.length} ranked of ${data.totalTeams} teams.` : `${data.rows.length} team${data.rows.length === 1 ? "" : "s"}.`}
        {data.showScores ? " Scores are the judges' average, out of 100." : ""}
      </p>
    </div>
  );
}
