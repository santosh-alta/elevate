"use client";

import { useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";

function Stars({ value, onChange, size = "md", label }: { value: number; onChange: (v: number) => void; size?: "md" | "lg"; label: string }) {
  const [hover, setHover] = useState(0);
  const s = size === "lg" ? "h-9 w-9" : "h-6 w-6";
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`}
          onClick={() => onChange(n)} onMouseEnter={() => setHover(n)}
          className="rounded p-0.5 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Star className={cn(s, (hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-border")} />
        </button>
      ))}
    </div>
  );
}

/** Overall rating, ratings for each area, recommend score, and two open questions. */
export function FeedbackForm({ eventId, online }: { eventId: string; online: boolean }) {
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [nps, setNps] = useState<number | null>(null);
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const AREAS: [string, string][] = [
    ["content", "Content and topics"], ["speakers", "Speakers and mentors"],
    ["organisation", "Organisation and schedule"], ["venue", online ? "Online experience (audio, link, platform)" : "Venue and facilities"],
  ];

  async function submit() {
    if (!rating) { setError("Please give an overall rating"); return; }
    setBusy(true); setError(null);
    try {
      await callApi("POST", `/events/${eventId}/feedback`, {
        rating, ...(nps != null && { nps }), aspects,
        ...(liked.trim() && { liked: liked.trim() }), ...(improve.trim() && { improve: improve.trim() }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your feedback");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <p className="mt-3 font-heading text-2xl font-bold">Thank you!</p>
        <p className="mt-1 text-muted">Your feedback goes straight to the team that ran this event.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="text-center">
        <p className="font-semibold">Overall, how was the event?</p>
        <div className="mt-2 flex justify-center"><Stars value={rating} onChange={setRating} size="lg" label="Overall rating" /></div>
      </div>

      <div className="space-y-3">
        <p className="font-semibold">Rate each part <span className="text-sm font-normal text-muted">(optional)</span></p>
        {AREAS.map(([k, label]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5">
            <span className="text-sm">{label}</span>
            <Stars value={aspects[k] ?? 0} onChange={(v) => setAspects({ ...aspects, [k]: v })} label={label} />
          </div>
        ))}
      </div>

      <div>
        <p className="font-semibold">How likely are you to recommend this event to a friend?</p>
        <div className="mt-2 grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i} type="button" onClick={() => setNps(i)}
              className={cn("rounded-lg border py-2 text-sm font-semibold transition", nps === i ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}
            >{i}</button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted"><span>Not likely</span><span>Very likely</span></div>
      </div>

      <label className="block">
        <span className="font-semibold">What did you like most?</span>
        <Textarea className="mt-2" value={liked} onChange={(e) => setLiked(e.target.value)} maxLength={2000} placeholder="A session, a speaker, something you learned…" />
      </label>
      <label className="block">
        <span className="font-semibold">What should we do better next time?</span>
        <Textarea className="mt-2" value={improve} onChange={(e) => setImprove(e.target.value)} maxLength={2000} placeholder="Timing, content, food, anything…" />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="button" className="w-full" size="lg" disabled={busy} onClick={() => void submit()}>{busy ? "Sending…" : "Send feedback"}</Button>
    </div>
  );
}
