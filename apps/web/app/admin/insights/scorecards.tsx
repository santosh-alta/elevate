"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lightbulb, MessageCircleHeart, Star, TrendingUp, Users, Wrench } from "lucide-react";
import { EventCover } from "@/components/event-card";
import { cn } from "@/components/ui/cn";
import type { ElevateEvent } from "@/lib/types";

export type Scorecard = {
  id: string; slug: string; title: string; type: string; month: string; campus: string;
  participants: number; attendanceRate: number | null; rating: number | null; responses: number; nps: number | null;
  aspects: Record<string, number>; vsType: number | null;
  startsAt: string; endsAt: string; mode: string; tags: string[]; coverImageUrl: string | null;
  category: { id: string; name: string; icon: string | null } | null; eventType: string;
  verdict: string | null; headline: string | null; wentWell: string[]; toImprove: string[]; nextTime: string[];
  liked: string[]; improve: string[];
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  strong: { label: "Strong result", cls: "bg-emerald-50 text-emerald-700" },
  good: { label: "Good result", cls: "bg-sky-100 text-sky-800" },
  mixed: { label: "Mixed result", cls: "bg-amber-50 text-amber-800" },
  weak: { label: "Needs attention", cls: "bg-red-50 text-red-700" },
};
const ASPECT_LABEL: Record<string, string> = { content: "Content", speakers: "Speakers", organisation: "Organisation", venue: "Venue / online" };
const FILTERS = [
  { key: "all", label: "All" }, { key: "attended", label: "Most attended" },
  { key: "rated", label: "Best rated" }, { key: "attention", label: "Needs attention" },
] as const;

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn("h-3.5 w-3.5", value >= n - 0.25 ? "fill-amber-400 text-amber-400" : "text-border")} />)}
    </span>
  );
}

/** One card per event: numbers, how it compares with its type, ratings by area, what people liked and want improved. */
export function Scorecards({ events }: { events: Scorecard[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const list = (() => {
    const xs = [...events];
    if (filter === "attended") return xs.sort((a, b) => b.participants - a.participants);
    if (filter === "rated") return xs.filter((e) => e.rating != null).sort((a, b) => b.rating! - a.rating!);
    if (filter === "attention") return xs.filter((e) => e.verdict === "weak" || e.verdict === "mixed" || (e.rating != null && e.rating < 3.5) || (e.vsType != null && e.vsType < -30));
    return xs.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === f.key ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}>{f.label}</button>
        ))}
      </div>
      {!list.length && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">{filter === "rated" ? "No events have feedback yet." : filter === "attention" ? "Nothing needs attention right now." : "No events in this period."}</p>}
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {list.map((e) => {
          const v = e.verdict ? VERDICT[e.verdict] : null;
          const improve = e.toImprove.length ? e.toImprove : e.improve;
          return (
            <article key={e.id} className="card-glow flex flex-col overflow-hidden rounded-brand border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="relative">
                <EventCover event={{ ...(e as unknown as ElevateEvent), type: e.eventType as ElevateEvent["type"] }} className="h-28" showLabel={false} />
                {v && <span className={cn("absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-soft", v.cls)}>{v.label}</span>}
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{e.type}</p>
                  <h3 className="mt-0.5 font-heading text-lg font-bold leading-snug">{e.title}</h3>
                  <p className="text-xs text-muted">{new Date(e.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {e.campus}</p>
                  {e.headline && <p className="mt-2 text-sm text-fg/80">{e.headline}</p>}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-bg p-2.5">
                    <p className="flex items-center justify-center gap-1 text-[11px] text-muted"><Users className="h-3 w-3" />People</p>
                    <p className="font-heading text-xl font-extrabold tabular-nums">{e.participants ? e.participants.toLocaleString("en-IN") : "–"}</p>
                    {!e.participants && <p className="text-[10px] text-muted">not recorded</p>}
                    {e.vsType != null && (
                      <p className={cn("flex items-center justify-center text-[10px] font-semibold", e.vsType >= 0 ? "text-emerald-700" : "text-red-600")} title={`Compared with the average ${e.type} event`}>
                        {e.vsType >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(e.vsType)}% vs type
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-bg p-2.5">
                    <p className="flex items-center justify-center gap-1 text-[11px] text-muted"><TrendingUp className="h-3 w-3" />Attended</p>
                    <p className="font-heading text-xl font-extrabold tabular-nums">{e.attendanceRate != null ? `${e.attendanceRate}%` : "–"}</p>
                  </div>
                  <div className="rounded-xl bg-bg p-2.5">
                    <p className="flex items-center justify-center gap-1 text-[11px] text-muted"><Star className="h-3 w-3" />Rating</p>
                    <p className="font-heading text-xl font-extrabold tabular-nums">{e.rating != null ? e.rating : "–"}</p>
                    {e.rating != null ? <Stars value={e.rating} /> : <p className="text-[10px] text-muted">no feedback</p>}
                  </div>
                </div>

                {Object.keys(e.aspects).length > 0 && (
                  <div className="space-y-1.5">
                    {Object.entries(e.aspects).map(([k, val]) => (
                      <div key={k} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-xs">
                        <span className="text-muted">{ASPECT_LABEL[k] ?? k}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-fg/[0.06]"><span className="block h-full rounded-full bg-primary" style={{ width: `${(val / 5) * 100}%` }} /></span>
                        <span className="text-right font-semibold tabular-nums">{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(e.wentWell.length > 0 || e.liked.length > 0) && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><MessageCircleHeart className="h-3.5 w-3.5" />What worked</p>
                    <ul className="space-y-1 text-xs text-fg/80">{(e.wentWell.length ? e.wentWell : e.liked.map((x) => `“${x}”`)).map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                {improve.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Wrench className="h-3.5 w-3.5" />To improve</p>
                    <ul className="space-y-1 text-xs text-fg/80">{(e.toImprove.length ? improve : improve.map((x) => `“${x}”`)).map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                {e.nextTime.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary"><Lightbulb className="h-3.5 w-3.5" />Next time</p>
                    <ul className="space-y-1 text-xs text-fg/80">{e.nextTime.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                {!e.responses && !e.headline && <p className="rounded-lg bg-bg px-3 py-2 text-xs text-muted">No feedback collected for this event. Open the report and click “Explain this event” for an AI review.</p>}

                <Link href={`/admin/events/${e.id}?tab=report`} className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Full report <ArrowRight className="h-4 w-4" /></Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
