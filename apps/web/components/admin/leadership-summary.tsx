"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useAiUsage, usageLabel } from "@/components/client/ai-assist";
import { callApi } from "@/components/client/api";
import { cn } from "@/components/ui/cn";

export type OutcomeSummary = {
  verdict: "strong" | "good" | "mixed" | "weak";
  headline: string; summary: string;
  highlights: string[]; concerns: string[]; why: string[]; recommendations: string[];
  generatedAt: string;
};

const VERDICT: Record<OutcomeSummary["verdict"], { label: string; cls: string }> = {
  strong: { label: "Strong result", cls: "bg-emerald-100 text-emerald-800" },
  good: { label: "Good result", cls: "bg-sky-100 text-sky-800" },
  mixed: { label: "Mixed result", cls: "bg-amber-100 text-amber-800" },
  weak: { label: "Needs attention", cls: "bg-red-100 text-red-800" },
};

/** "How did it go, and why?" An AI review of the outcome for leadership, kept with the report. */
export function LeadershipSummary({ eventId, initial }: { eventId: string; initial?: OutcomeSummary | null }) {
  const [data, setData] = useState<OutcomeSummary | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const usage = useAiUsage();
  const out = !!usage && usage.remaining <= 0;

  async function run() {
    setBusy(true); setErr(null);
    try {
      setData(await callApi<OutcomeSummary>("POST", `/events/${eventId}/outcome/summary`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not write the summary");
    } finally {
      setBusy(false);
    }
  }

  if (usage && !usage.enabled && !data) return null;
  return (
    <section className="mt-6 overflow-hidden rounded-brand border border-primary/20 bg-gradient-to-br from-primary/[0.05] to-accent/[0.05] break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-5 py-3">
        <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />Leadership summary</p>
        <div className="flex items-center gap-3 print:hidden">
          <span className="text-xs text-muted">{busy ? "Analysing… (15–30 seconds)" : usageLabel(usage)}</span>
          <button
            type="button" onClick={() => void run()} disabled={busy || out}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : data ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {data ? "Refresh" : "Explain this event"}
          </button>
        </div>
      </div>
      {err && <p className="px-5 pt-3 text-sm text-red-600">{err}</p>}
      {!data && !busy && (
        <p className="px-5 py-4 text-sm text-muted">
          One click for a plain-English review: how the event went, why, how it compares with similar past events, and what to change next time.
          It reads the numbers, the checklist by team and the feedback comments.
        </p>
      )}
      {data && (
        <div className="space-y-5 px-5 py-5">
          <div>
            <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold", VERDICT[data.verdict].cls)}>{VERDICT[data.verdict].label}</span>
            <p className="mt-2 text-lg font-bold leading-snug">{data.headline}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg/80">{data.summary}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Block icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} title="What went well" items={data.highlights} />
            <Block icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} title="What fell short" items={data.concerns} />
            <Block icon={<HelpCircle className="h-4 w-4 text-sky-600" />} title="Why" items={data.why} />
            <Block icon={<Lightbulb className="h-4 w-4 text-primary" />} title="Next time" items={data.recommendations} />
          </div>
          <p className="text-[11px] text-muted">Written by AI from this report's data on {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Check important numbers above.</p>
        </div>
      )}
    </section>
  );
}

function Block({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</p>
      <ul className="space-y-1.5 text-sm leading-relaxed text-fg/85">
        {items.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg/40" />{t}</li>)}
      </ul>
    </div>
  );
}
