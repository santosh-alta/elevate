"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsRight, ListChecks, Lock, MessageSquareShare, Pencil, Plus, Trash2, Unlock, X } from "lucide-react";
import { DEFAULT_ROUND_NAMES } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { Badge, Button, Field, Input, Progress, Select, buttonClass } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { fmtDateTime, toLocalInput } from "@/lib/format";
import type { BoardRow, JudgeProgress } from "@/lib/judging";
import type { Round, Team } from "@/lib/types";

interface Props {
  eventId: string;
  rounds: Round[];
  teams: Team[];
  progress: Record<string, JudgeProgress[]>;
  boards: Record<string, BoardRow[]>;
  shortlists: Record<string, string[]>;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return false;
    setBusy(true); setErr(null);
    try { await fn(); router.refresh(); return true; } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); return false; } finally { setBusy(false); }
  }
  return { busy, err, run, setErr };
}

export function RoundsManager({ eventId, rounds, teams, progress, boards, shortlists }: Props) {
  const { busy, err, run } = useAction();
  const [adding, setAdding] = useState(false);
  const missing = DEFAULT_ROUND_NAMES.filter((n) => !rounds.some((r) => r.name.toLowerCase() === n.toLowerCase()));
  const nextOrder = Math.max(0, ...rounds.map((r) => r.sortOrder ?? 0)) + 1;

  const swap = (i: number, j: number) => run(async () => {
    const a = rounds[i], b = rounds[j];
    await callApi("PATCH", `/rounds/${a.id}`, { sortOrder: j + 1 });
    await callApi("PATCH", `/rounds/${b.id}`, { sortOrder: i + 1 });
  });

  return (
    <div>
      <ul className="divide-y divide-border">
        {rounds.map((r, i) => (
          <RoundRow
            key={r.id} round={r} index={i} total={rounds.length} prev={rounds[i - 1]} teams={teams}
            progress={progress[r.id] ?? []} boards={boards} shortlist={shortlists[r.id] ?? []} rounds={rounds}
            onMove={(d) => swap(i, i + d)}
          />
        ))}
        {!rounds.length && <li className="px-5 py-4 text-sm text-muted">No checks yet. Judges score teams in checks (rounds) — start with the defaults below.</li>}
      </ul>
      <div className="space-y-3 border-t border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {missing.map((n, k) => (
            <Button key={n} type="button" size="sm" variant="outline" disabled={busy}
              onClick={() => run(() => callApi("POST", `/events/${eventId}/rounds`, { name: n, sortOrder: nextOrder + k }))}>
              <Plus className="h-3.5 w-3.5" />{n}
            </Button>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}><Plus className="h-3.5 w-3.5" />Custom check</Button>
        </div>
        {adding && (
          <RoundForm
            submitLabel="Add check"
            onCancel={() => setAdding(false)}
            onSubmit={(body) => run(() => callApi("POST", `/events/${eventId}/rounds`, { ...body, sortOrder: nextOrder })).then((ok) => { if (ok) setAdding(false); })}
          />
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <p className="text-xs text-muted">Only one check can be open at a time — opening one closes the others. Judges are notified when a check opens.</p>
      </div>
    </div>
  );
}

type RoundBody = { name: string; description?: string | null; opensAt?: string | null; closesAt?: string | null; restrictTeams: boolean; shareFeedback: boolean };

function RoundForm({ round, onSubmit, onCancel, submitLabel }: { round?: Round; onSubmit: (b: RoundBody) => void; onCancel: () => void; submitLabel: string }) {
  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-bg/50 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (k: string) => String(fd.get(k) ?? "").trim();
        const date = (k: string) => (v(k) ? new Date(v(k)).toISOString() : round ? null : undefined);
        onSubmit({
          name: v("name"), description: v("description") || (round ? null : undefined),
          opensAt: date("opensAt"), closesAt: date("closesAt"),
          restrictTeams: fd.get("restrictTeams") === "on", shareFeedback: fd.get("shareFeedback") === "on",
        });
      }}
    >
      <Field label="Name"><Input name="name" required defaultValue={round?.name ?? ""} placeholder="e.g. Mentor check" /></Field>
      <Field label="Note for judges"><Input name="description" defaultValue={round?.description ?? ""} placeholder="Optional" /></Field>
      <Field label="Scheduled to open"><Input name="opensAt" type="datetime-local" defaultValue={toLocalInput(round?.opensAt)} /></Field>
      <Field label="Scheduled to close"><Input name="closesAt" type="datetime-local" defaultValue={toLocalInput(round?.closesAt)} /></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="restrictTeams" defaultChecked={round?.restrictTeams} className="mt-0.5 accent-[rgb(var(--primary))]" /><span>Only shortlisted teams<span className="block text-xs text-muted">Judges see only teams advanced into this check</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="shareFeedback" defaultChecked={round?.shareFeedback} className="mt-0.5 accent-[rgb(var(--primary))]" /><span>Share feedback with teams<span className="block text-xs text-muted">After it closes, teams see average score and remarks (no judge names)</span></span></label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm">{submitLabel}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function RoundRow({ round: r, index, total, prev, teams, progress, boards, shortlist, rounds, onMove }: {
  round: Round; index: number; total: number; prev?: Round; teams: Team[]; progress: JudgeProgress[];
  boards: Record<string, BoardRow[]>; shortlist: string[]; rounds: Round[]; onMove: (d: number) => void;
}) {
  const { busy, err, run } = useAction();
  const [editing, setEditing] = useState(false);
  const advanceRef = useRef<HTMLDialogElement>(null);
  const shortlistRef = useRef<HTMLDialogElement>(null);
  const done = progress.reduce((a, p) => a + p.scored, 0);
  const all = progress.reduce((a, p) => a + p.total, 0);
  const status = r.isOpen ? <Badge tone="green"><Unlock className="h-3 w-3" />Open</Badge> : r.closedAt ? <Badge tone="gray"><Lock className="h-3 w-3" />Closed</Badge> : <Badge tone="blue">Not opened</Badge>;

  return (
    <li className={cn("px-5 py-4", r.isOpen && "bg-emerald-50/40")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col">
          <button type="button" aria-label="Move up" disabled={index === 0} className={buttonClass("ghost", "sm", "h-6 px-1")} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Move down" disabled={index === total - 1} className={buttonClass("ghost", "sm", "h-6 px-1")} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-muted">#{index + 1}</span>
            <p className="font-semibold">{r.name}</p>
            {status}
            {r.restrictTeams && <Badge tone="purple"><ListChecks className="h-3 w-3" />{shortlist.length} shortlisted</Badge>}
            {r.shareFeedback && <Badge tone="teal"><MessageSquareShare className="h-3 w-3" />Feedback shared</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[r.description, r.opensAt && `Opens ${fmtDateTime(r.opensAt)}`, r.closesAt && `Closes ${fmtDateTime(r.closesAt)}`, r.closedAt && `Closed ${fmtDateTime(r.closedAt)}`].filter(Boolean).join(" · ") || "No schedule set"}
          </p>
          {progress.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-3 text-xs text-muted"><span className="w-28">All judges</span><Progress value={all ? (done / all) * 100 : 0} className="max-w-xs" /><span className="tabular-nums">{done}/{all}</span></div>
              {progress.map((p) => (
                <div key={p.judgeId ?? p.name} className="flex items-center gap-3 text-xs">
                  <span className="w-28 truncate" title={p.email}>{p.name}</span>
                  <Progress value={p.total ? (p.scored / p.total) * 100 : 0} className="h-1.5 max-w-xs" />
                  <span className="tabular-nums text-muted">{p.scored}/{p.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant={r.isOpen ? "outline" : "primary"} disabled={busy}
            onClick={() => run(() => callApi("PATCH", `/rounds/${r.id}`, { isOpen: !r.isOpen }), !r.isOpen && rounds.some((x) => x.isOpen && x.id !== r.id) ? `Open “${r.name}”? The currently open check will be closed.` : undefined)}>
            {r.isOpen ? "Close" : r.closedAt ? "Reopen" : "Open"}
          </Button>
          {index > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => advanceRef.current?.showModal()}><ChevronsRight className="h-4 w-4" />Advance teams</Button>}
          <Button type="button" size="sm" variant="ghost" onClick={() => shortlistRef.current?.showModal()}><ListChecks className="h-4 w-4" />Shortlist</Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Edit check" onClick={() => setEditing((v) => !v)}><Pencil className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Delete check" className="text-red-600" disabled={busy}
            onClick={() => run(() => callApi("DELETE", `/rounds/${r.id}`), `Delete “${r.name}”? Only checks without scores can be deleted.`)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-3">
          <RoundForm round={r} submitLabel="Save check" onCancel={() => setEditing(false)}
            onSubmit={(body) => run(() => callApi("PATCH", `/rounds/${r.id}`, body)).then((ok) => { if (ok) setEditing(false); })} />
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <Dialog ref={shortlistRef} title={`Shortlist for “${r.name}”`}>
        <ShortlistEditor round={r} teams={teams} initial={shortlist} onDone={() => shortlistRef.current?.close()} />
      </Dialog>
      {index > 0 && (
        <Dialog ref={advanceRef} title={`Advance teams to “${r.name}”`}>
          <AdvanceForm round={r} rounds={rounds.slice(0, index)} defaultFrom={prev?.id} boards={boards} onDone={() => advanceRef.current?.close()} />
        </Dialog>
      )}
    </li>
  );
}

function Dialog({ ref, title, children }: { ref: React.Ref<HTMLDialogElement>; title: string; children: ReactNode }) {
  return (
    <dialog ref={ref} className="w-[min(640px,calc(100vw-2rem))] rounded-brand border border-border bg-card p-0 text-fg shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-semibold">{title}</h3>
        <form method="dialog"><button aria-label="Close" className={buttonClass("ghost", "sm", "px-2")}><X className="h-4 w-4" /></button></form>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function ShortlistEditor({ round, teams, initial, onDone }: { round: Round; teams: Team[]; initial: string[]; onDone: () => void }) {
  const { busy, err, run } = useAction();
  const [ids, setIds] = useState<string[]>(initial);
  const toggle = (id: string) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Pick the teams judges should see in this check. Saving turns on “only shortlisted teams”.</p>
      <div className="flex gap-2 text-xs">
        <button type="button" className="text-primary hover:underline" onClick={() => setIds(teams.map((t) => t.id))}>Select all</button>
        <button type="button" className="text-primary hover:underline" onClick={() => setIds([])}>Clear</button>
        <span className="text-muted">{ids.length} of {teams.length} selected</span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {teams.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="checkbox" checked={ids.includes(t.id)} onChange={() => toggle(t.id)} className="accent-[rgb(var(--primary))]" />
              <span className="truncate">{t.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => run(() => callApi("POST", `/rounds/${round.id}/teams`, { teamIds: ids })).then((ok) => { if (ok) onDone(); })}>Save shortlist</Button>
        {round.restrictTeams && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => callApi("PATCH", `/rounds/${round.id}`, { restrictTeams: false })).then((ok) => { if (ok) onDone(); })}>Let judges see every team</Button>
        )}
      </div>
    </div>
  );
}

function AdvanceForm({ round, rounds, defaultFrom, boards, onDone }: { round: Round; rounds: Round[]; defaultFrom?: string; boards: Record<string, BoardRow[]>; onDone: () => void }) {
  const { busy, err, run, setErr } = useAction();
  const [from, setFrom] = useState(defaultFrom ?? rounds[rounds.length - 1]?.id ?? "");
  const [mode, setMode] = useState<"top" | "minScore" | "pick">("top");
  const [top, setTop] = useState(10);
  const [minScore, setMinScore] = useState(60);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const board = boards[from] ?? [];
  const preview = mode === "top" ? board.slice(0, top) : mode === "minScore" ? board.filter((b) => b.total >= minScore) : board.filter((b) => picked.includes(b.team.id));

  return (
    <div className="space-y-4">
      <Field label="From check">
        <Select value={from} onChange={(e) => { setFrom(e.target.value); setPicked([]); }}>
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <div className="inline-flex rounded-brand border border-border bg-bg p-1 text-sm">
        {([["top", "Top N"], ["minScore", "Minimum score"], ["pick", "Pick teams"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={cn("rounded-[calc(var(--radius)-4px)] px-3 py-1.5", mode === k ? "bg-card font-medium text-primary shadow-sm" : "text-muted")}>{l}</button>
        ))}
      </div>
      {mode === "top" && <Field label="Number of teams"><Input type="number" min={1} value={top} onChange={(e) => setTop(Math.max(1, Number(e.target.value)))} className="w-32" /></Field>}
      {mode === "minScore" && <Field label="Minimum total score (out of 100)"><Input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-32" /></Field>}
      {board.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {board.map((b) => {
            const inPreview = preview.some((p) => p.team.id === b.team.id);
            return (
              <li key={b.team.id} className={cn("flex items-center gap-3 px-3 py-2", inPreview && "bg-primary/5")}>
                {mode === "pick" ? (
                  <input type="checkbox" checked={picked.includes(b.team.id)} aria-label={`Advance ${b.team.name}`}
                    onChange={() => setPicked((s) => (s.includes(b.team.id) ? s.filter((x) => x !== b.team.id) : [...s, b.team.id]))} className="accent-[rgb(var(--primary))]" />
                ) : <span className={cn("h-2 w-2 rounded-full", inPreview ? "bg-primary" : "bg-border")} />}
                <span className="w-8 tabular-nums text-muted">#{b.rank}</span>
                <span className="min-w-0 flex-1 truncate">{b.team.name}</span>
                <span className="tabular-nums font-medium">{b.total.toFixed(1)}</span>
                {b.recommendCount > 0 && <Badge tone="green">{b.recommendCount} rec.</Badge>}
              </li>
            );
          })}
        </ul>
      ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No submitted scores in this check yet.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {result && <p className="text-sm text-emerald-700">{result}</p>}
      <div className="flex items-center gap-3">
        <Button
          type="button" disabled={busy || !from || (mode === "pick" && !picked.length)}
          onClick={async () => {
            setResult(null); setErr(null);
            const body: Record<string, unknown> = { fromRoundId: from };
            if (mode === "top") body.top = top;
            if (mode === "minScore") body.minScore = minScore;
            if (mode === "pick") body.teamIds = picked;
            let count: number | null = null;
            const ok = await run(async () => {
              const res = await callApi<unknown>("POST", `/rounds/${round.id}/advance`, body);
              const list = Array.isArray(res) ? res : (res as { teams?: unknown[] } | null)?.teams;
              count = Array.isArray(list) ? list.length : null;
            });
            if (ok) { setResult(`${count ?? preview.length} team${(count ?? preview.length) === 1 ? "" : "s"} shortlisted into ${round.name}.`); setTimeout(onDone, 1200); }
          }}
        >
          <ChevronsRight className="h-4 w-4" />Advance {preview.length || ""} team{preview.length === 1 ? "" : "s"}
        </Button>
        <span className="text-xs text-muted">Replaces this check&apos;s shortlist.</span>
      </div>
    </div>
  );
}
