"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

const LABELS = ["", "Needs a lot of work", "Not great", "Okay", "Good", "Love it"];

export function FeedbackForm({ name, email, campuses }: { name?: string; email?: string; campuses: string[] }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="mt-4 font-heading text-2xl font-bold">Thank you! 🙌</h2>
        <p className="mt-2 text-muted">We read every response. Keep an eye out: your ideas may show up soon.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => { setDone(false); setRating(0); }}>Send more feedback</Button>
          <Link href="/" className="inline-flex h-10 items-center rounded-brand px-4 text-sm font-medium text-primary hover:bg-primary/5">Back to events</Link>
        </div>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
        setBusy(true); setError(null);
        try {
          await callApi("POST", "/feedback", {
            rating: rating || undefined, name: v("name"), email: v("email"), campus: v("campus"),
            liked: v("liked"), confusing: v("confusing"), missing: v("missing"), broken: v("broken"),
          });
          setDone(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err) { setError((err as Error).message); }
        finally { setBusy(false); }
      }}
    >
      <div>
        <p className="text-sm font-medium">Overall, how do you like it?</p>
        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className="rounded p-0.5 transition hover:scale-110">
              <Star className={`h-8 w-8 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-border"}`} />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted">{LABELS[shown]}</span>
        </div>
      </div>
      <Field label="👍 What did you like?"><Textarea name="liked" rows={3} placeholder="Anything that felt useful, easy or fun" /></Field>
      <Field label="🤔 What was confusing?"><Textarea name="confusing" rows={3} placeholder="Anything that was hard to find or understand" /></Field>
      <Field label="💡 What’s missing, or what would you add?"><Textarea name="missing" rows={3} placeholder="Features or ideas you’d love to see" /></Field>
      <Field label="🐞 Anything broken?" hint="Tell us the page and what happened. Screenshots help: send them to the team on WhatsApp."><Textarea name="broken" rows={2} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name (optional)"><Input name="name" defaultValue={name ?? ""} /></Field>
        <Field label="Email (optional)"><Input name="email" type="email" defaultValue={email ?? ""} /></Field>
        <Field label="Campus (optional)">
          <Select name="campus" defaultValue=""><option value="">Select</option>{campuses.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send feedback"}</Button>
    </form>
  );
}
