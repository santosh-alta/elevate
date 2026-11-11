"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ExternalLink, Github, Loader2, Lock, Search, ThumbsUp } from "lucide-react";
import { callApi } from "@/components/client/api";
import { cn } from "@/components/ui/cn";

type Criterion = { id: string; name: string; description?: string | null; maxScore: number; weight: number };
type Team = {
  id: string; name: string; projectTitle?: string | null; projectSummary?: string | null;
  repoUrl?: string | null; demoUrl?: string | null; deckUrl?: string | null; videoUrl?: string | null;
  problemStatement?: { code?: string | null; title: string } | null;
  members: { id: string; name: string; isLeader?: boolean }[];
  myScores: { criterionId: string; value: number; comment?: string | null; submittedAt?: string | null }[];
  myReview: { comment?: string | null; tags?: string[]; recommend?: boolean | null; submittedAt?: string | null } | null;
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
};
export type JudgeView = {
  event: { id: string; slug: string; title: string };
  round: { id: string; name: string; isOpen: boolean };
  rounds: { id: string; name: string; isOpen: boolean }[];
  criteria: Criterion[];
  comments: { text: string; category: string }[];
  teams: Team[];
};

const STATUS = {
  NOT_STARTED: { label: "Not scored", cls: "bg-fg/5 text-muted" },
  DRAFT: { label: "Draft", cls: "bg-amber-50 text-amber-800" },
  SUBMITTED: { label: "Submitted", cls: "bg-emerald-50 text-emerald-700" },
};

/** Team list on the left (or first on phones); scoring form for the chosen team. */
export function JudgeBoard({ initial }: { initial: JudgeView }) {
  const [view, setView] = useState(initial);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loadingRound, setLoadingRound] = useState(false);
  const team = view.teams.find((t) => t.id === teamId) ?? null;
  const done = view.teams.filter((t) => t.status === "SUBMITTED").length;
  const shown = view.teams.filter((t) => !q || `${t.name} ${t.projectTitle ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  async function reload(roundId?: string) {
    const v = await callApi<JudgeView>("GET", `/judge/events/${view.event.id}${roundId ? `?roundId=${roundId}` : ""}`);
    setView(v);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Judging</p>
          <h1 className="font-heading text-2xl font-bold sm:text-3xl">{view.event.title}</h1>
          <p className="text-sm text-muted">{done} of {view.teams.length} teams submitted · {view.criteria.length} questions</p>
        </div>
        {view.rounds.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {view.rounds.map((r) => (
              <button
                key={r.id} type="button" disabled={loadingRound}
                onClick={async () => { setLoadingRound(true); setTeamId(null); await reload(r.id).finally(() => setLoadingRound(false)); }}
                className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", view.round.id === r.id ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}
              >{r.name}{!r.isOpen && " (closed)"}</button>
            ))}
          </div>
        )}
      </div>
      {!view.round.isOpen && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><Lock className="h-4 w-4" />{view.round.name} isn&rsquo;t open for scoring yet. The organisers open it on the day.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className={cn("space-y-3", team && "hidden lg:block")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team" className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm focus:border-primary focus:outline-none" />
          </div>
          <ul className="space-y-2">
            {shown.map((t) => (
              <li key={t.id}>
                <button
                  type="button" onClick={() => setTeamId(t.id)}
                  className={cn("w-full rounded-xl border p-3 text-left transition", teamId === t.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{t.name}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[t.status].cls)}>{STATUS[t.status].label}</span>
                  </span>
                  {t.projectTitle && <span className="mt-0.5 block truncate text-xs text-muted">{t.projectTitle}</span>}
                </button>
              </li>
            ))}
            {!view.teams.length && <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">No teams to score yet.</li>}
          </ul>
        </aside>

        <section>
          {team ? (
            <ScoreForm
              key={`${team.id}-${view.round.id}`} team={team} view={view}
              onBack={() => setTeamId(null)}
              onSaved={async () => { await reload(view.round.id); }}
            />
          ) : (
            <div className="hidden rounded-2xl border border-dashed border-border p-10 text-center text-muted lg:block">Pick a team on the left to start scoring.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function ScoreForm({ team, view, onBack, onSaved }: { team: Team; view: JudgeView; onBack: () => void; onSaved: () => Promise<void> }) {
  const locked = team.status === "SUBMITTED" || !view.round.isOpen;
  const [values, setValues] = useState<Record<string, number | undefined>>(() => Object.fromEntries(team.myScores.map((s) => [s.criterionId, s.value])));
  const [tags, setTags] = useState<string[]>(team.myReview?.tags ?? []);
  const [comment, setComment] = useState(team.myReview?.comment ?? "");
  const [recommend, setRecommend] = useState<boolean>(!!team.myReview?.recommend);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const total = useMemo(() => view.criteria.reduce((s, c) => s + (values[c.id] ?? 0), 0), [values, view.criteria]);
  const max = view.criteria.reduce((s, c) => s + c.maxScore, 0);
  const missing = view.criteria.filter((c) => values[c.id] == null).length;

  async function save(submit: boolean) {
    if (submit && missing) { setMsg({ ok: false, text: `Give marks for all questions first (${missing} left).` }); return; }
    if (submit && !window.confirm(`Submit ${total}/${max} for ${team.name}? You can't change it after submitting.`)) return;
    setBusy(submit ? "submit" : "save"); setMsg(null);
    try {
      await callApi("PUT", "/judge/scores", {
        roundId: view.round.id, teamId: team.id, submit,
        scores: view.criteria.filter((c) => values[c.id] != null).map((c) => ({ criterionId: c.id, value: values[c.id]! })),
        review: { comment, tags, recommend },
      });
      setMsg({ ok: true, text: submit ? "Submitted. Thank you!" : "Saved as draft." });
      await onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" });
    } finally {
      setBusy(null);
    }
  }

  const link = (href: string | null | undefined, label: string, icon?: React.ReactNode) => href && (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary/50 hover:text-primary">{icon}{label}<ExternalLink className="h-3 w-3" /></a>
  );

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg lg:hidden"><ChevronLeft className="h-4 w-4" />All teams</button>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-bold">{team.name}</h2>
            {team.projectTitle && <p className="font-medium">{team.projectTitle}</p>}
            {team.problemStatement && <p className="text-sm text-muted">Problem: {team.problemStatement.code ? `${team.problemStatement.code} · ` : ""}{team.problemStatement.title}</p>}
          </div>
          <div className="text-right">
            <p className="font-heading text-3xl font-extrabold">{total}<span className="text-base font-semibold text-muted">/{max}</span></p>
            <p className={cn("text-xs font-semibold", STATUS[team.status].cls.split(" ").pop())}>{STATUS[team.status].label}</p>
          </div>
        </div>
        {team.projectSummary && <p className="mt-3 text-sm text-fg/80">{team.projectSummary}</p>}
        <p className="mt-3 text-xs text-muted">Team: {team.members.map((m) => `${m.name}${m.isLeader ? " (lead)" : ""}`).join(", ")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {link(team.repoUrl, "Code", <Github className="h-3 w-3" />)}{link(team.demoUrl, "Demo")}{link(team.deckUrl, "Slides")}{link(team.videoUrl, "Video")}
        </div>
      </div>

      <div className="space-y-3">
        {view.criteria.map((c, i) => (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{i + 1}. {c.name}</p>
                {c.description && <p className="text-xs text-muted">{c.description}</p>}
              </div>
              <span className="shrink-0 font-heading text-xl font-bold">{values[c.id] ?? "–"}<span className="text-sm font-medium text-muted">/{c.maxScore}</span></span>
            </div>
            <div className={cn("mt-3 grid gap-1", c.maxScore <= 10 ? "grid-cols-11" : "grid-cols-1")}>
              {c.maxScore <= 10 ? Array.from({ length: c.maxScore + 1 }, (_, n) => (
                <button
                  key={n} type="button" disabled={locked} onClick={() => setValues({ ...values, [c.id]: n })}
                  className={cn("rounded-lg border py-2 text-sm font-semibold transition disabled:opacity-60", values[c.id] === n ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}
                >{n}</button>
              )) : (
                <input type="number" min={0} max={c.maxScore} disabled={locked} value={values[c.id] ?? ""} onChange={(e) => setValues({ ...values, [c.id]: e.target.value === "" ? undefined : Math.min(c.maxScore, Math.max(0, Number(e.target.value))) })} className="h-10 w-32 rounded-lg border border-border bg-bg px-3" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="font-semibold">Quick comments for the team</p>
        <div className="flex flex-wrap gap-1.5">
          {view.comments.map((x) => {
            const on = tags.includes(x.text);
            return (
              <button key={x.text} type="button" disabled={locked} onClick={() => setTags(on ? tags.filter((t) => t !== x.text) : [...tags, x.text])}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", on ? (x.category === "Positive" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-amber-500 bg-amber-50 text-amber-800") : "border-border hover:border-primary/50")}
              >{x.text}</button>
            );
          })}
        </div>
        <textarea value={comment} disabled={locked} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={4000} placeholder="Anything else for the team or the organisers (optional)" className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={locked} checked={recommend} onChange={(e) => setRecommend(e.target.checked)} className="accent-[rgb(var(--primary))]" />
          <ThumbsUp className="h-4 w-4 text-primary" />Recommend this team for the next round / finals
        </label>
      </div>

      {msg && <p className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>}
      {locked ? (
        <p className="flex items-center gap-2 text-sm text-muted">{team.status === "SUBMITTED" ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" />Submitted. Scores can&rsquo;t be changed.</> : <><Lock className="h-4 w-4" />Scoring is closed for this round.</>}</p>
      ) : (
        <div className="sticky bottom-3 flex gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lift backdrop-blur">
          <button type="button" disabled={!!busy} onClick={() => void save(false)} className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold hover:border-primary/50 disabled:opacity-50">
            {busy === "save" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save draft"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void save(true)} className="flex-[2] rounded-xl bg-primary py-3 text-sm font-bold text-primary-fg hover:opacity-90 disabled:opacity-50">
            {busy === "submit" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Submit ${total}/${max}`}
          </button>
        </div>
      )}
    </div>
  );
}
