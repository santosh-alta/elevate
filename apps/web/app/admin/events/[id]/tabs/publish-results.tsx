"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/components/client/api";
import { Button, Select } from "@/components/ui";
import type { Team } from "@/lib/types";

const AWARDS = [
  { value: "", label: "No award" },
  { value: "WINNER", label: "Winner" },
  { value: "RUNNER_UP", label: "1st runner-up" },
  { value: "SECOND_RUNNER_UP", label: "2nd runner-up" },
  { value: "SPECIAL_MENTION", label: "Special mention" },
];
const DEFAULT_BY_RANK = ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP"];

/**
 * Awards + finalists. `ranking` is the final check's ranking (team ids, best first); `finalists` defaults to
 * the last check's shortlist. Finalists who don't win get a FINALIST certificate.
 */
export function PublishResults({ eventId, teams, ranking, finalists: initialFinalists, published }: {
  eventId: string; teams: Team[]; ranking: { teamId: string; total?: number }[]; finalists: string[]; published: boolean;
}) {
  const router = useRouter();
  const byId = new Map(teams.map((t) => [t.id, t]));
  const ordered = [
    ...ranking.map((r) => byId.get(r.teamId)).filter((t): t is Team => !!t),
    ...teams.filter((t) => !ranking.some((r) => r.teamId === t.id)),
  ];
  const anyAward = teams.some((t) => t.award);
  const [awards, setAwards] = useState<Record<string, string>>(() =>
    Object.fromEntries(ordered.map((t, i) => [t.id, t.award ?? (!anyAward && ranking.length ? DEFAULT_BY_RANK[i] ?? "" : "")])),
  );
  const [finalists, setFinalists] = useState<string[]>(initialFinalists);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!teams.length) return <p className="text-sm text-muted">No teams to award yet.</p>;
  const score = (id: string) => ranking.find((r) => r.teamId === id)?.total;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted"><span>Team</span><span className="w-20 text-center">Finalist</span><span className="w-44">Award</span></div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {ordered.map((t, i) => (
          <li key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2">
            <span className="min-w-0 truncate text-sm">
              <span className="mr-2 tabular-nums text-muted">{i + 1}.</span>{t.name}
              {score(t.id) !== undefined && <span className="ml-2 text-xs tabular-nums text-muted">{score(t.id)!.toFixed(1)}</span>}
            </span>
            <span className="flex w-20 justify-center">
              <input type="checkbox" aria-label={`${t.name} is a finalist`} checked={finalists.includes(t.id) || !!awards[t.id]} disabled={!!awards[t.id]}
                onChange={() => setFinalists((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))} className="accent-[rgb(var(--primary))]" />
            </span>
            <Select value={awards[t.id] ?? ""} onChange={(e) => setAwards({ ...awards, [t.id]: e.target.value })} className="h-8 w-44 py-1 text-xs" aria-label={`Award for ${t.name}`}>
              {AWARDS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Winners appear on the public page and the Winners hall of fame. Finalists who don&apos;t win get a Finalist certificate; everyone else gets Participation.</p>
      <div className="flex items-center gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(published ? "Update published results? Teams are emailed again." : "Publish results? They'll be visible on the public event page and every team is emailed.")) return;
            setBusy(true); setMsg(null);
            try {
              const results = ordered
                .map((t) => ({ teamId: t.id, award: awards[t.id] || undefined, rank: ranking.findIndex((r) => r.teamId === t.id) + 1 || undefined }))
                .filter((a) => a.award);
              const awardedRank = new Map<string, number>();
              results.forEach((r, i) => awardedRank.set(r.teamId, i + 1));
              await callApi("POST", `/events/${eventId}/results`, {
                results: results.map((r) => ({ ...r, rank: r.rank ?? awardedRank.get(r.teamId) })),
                finalists: [...new Set([...finalists, ...results.map((r) => r.teamId)])],
              });
              setMsg({ ok: true, text: "Results published." }); router.refresh();
            } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
          }}
        >
          {published ? "Update results" : "Publish results"}
        </Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
