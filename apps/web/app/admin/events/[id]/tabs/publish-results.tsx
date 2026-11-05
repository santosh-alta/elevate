"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/components/client/api";
import { Button, Select } from "@/components/ui";
import type { LeaderboardRow, Team } from "@/lib/types";

const AWARDS = [
  { value: "", label: "No award" },
  { value: "WINNER", label: "Winner" },
  { value: "RUNNER_UP", label: "Runner-up" },
  { value: "SECOND_RUNNER_UP", label: "2nd runner-up" },
  { value: "SPECIAL_MENTION", label: "Special mention" },
];
const DEFAULT_BY_RANK = ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP"];

export function PublishResults({ eventId, teams, ranking, published }: { eventId: string; teams: Team[]; ranking: LeaderboardRow[]; published: boolean }) {
  const router = useRouter();
  const ordered = ranking.length ? [...ranking.map((r) => r.team), ...teams.filter((t) => !ranking.some((r) => r.team.id === t.id))] : teams;
  const [awards, setAwards] = useState<Record<string, string>>(() =>
    Object.fromEntries(ordered.map((t, i) => [t.id, t.award ?? (ranking.length ? DEFAULT_BY_RANK[i] ?? "" : "")])),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!teams.length) return <p className="text-sm text-muted">No teams to award yet.</p>;

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {ordered.map((t, i) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-sm"><span className="mr-2 tabular-nums text-muted">{i + 1}.</span>{t.name}</span>
            <Select value={awards[t.id] ?? ""} onChange={(e) => setAwards({ ...awards, [t.id]: e.target.value })} className="h-8 w-44 py-1 text-xs">
              {AWARDS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(published ? "Update published results?" : "Publish results? They'll be visible on the public event page.")) return;
            setBusy(true); setMsg(null);
            try {
              const list = ordered.map((t, i) => ({ teamId: t.id, award: awards[t.id] || undefined, rank: i + 1 })).filter((a) => a.award);
              await callApi("POST", `/events/${eventId}/results`, { awards: list });
              setMsg("Results published."); router.refresh();
            } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
          }}
        >
          {published ? "Update results" : "Publish results"}
        </Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
