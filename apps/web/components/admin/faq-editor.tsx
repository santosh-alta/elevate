"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Input, Textarea, buttonClass } from "@/components/ui";
import type { Faq } from "@/lib/types";

const STARTERS: Faq[] = [
  { q: "Who can attend?", a: "" },
  { q: "Is there a registration fee?", a: "" },
  { q: "Will I get a certificate?", a: "Yes. Everyone who checks in receives a digital certificate after the event." },
  { q: "What should I bring?", a: "" },
];

export function FaqEditor({ eventId, faqs }: { eventId: string; faqs: Faq[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Faq[]>(faqs.length ? faqs : []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Faq>) => setItems(items.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex gap-2">
            <Input value={f.q} onChange={(e) => set(i, { q: e.target.value })} placeholder="Question" aria-label={`Question ${i + 1}`} />
            <button type="button" aria-label="Move up" className={buttonClass("ghost", "sm", "h-10")} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" aria-label="Move down" className={buttonClass("ghost", "sm", "h-10")} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
            <button type="button" aria-label="Remove question" className={buttonClass("ghost", "sm", "h-10")} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
          <Textarea value={f.a} onChange={(e) => set(i, { a: e.target.value })} placeholder="Answer" rows={2} aria-label={`Answer ${i + 1}`} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { q: "", a: "" }])}><Plus className="h-4 w-4" />Add question</Button>
        {!items.length && <Button type="button" variant="ghost" size="sm" onClick={() => setItems(STARTERS)}>Start with common questions</Button>}
        <div className="flex-1" />
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
        <Button
          type="button" size="sm" disabled={busy}
          onClick={async () => {
            setBusy(true); setMsg(null);
            try {
              await callApi("PATCH", `/events/${eventId}`, { faqs: items.filter((f) => f.q.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })) });
              setMsg({ ok: true, text: "FAQs saved" });
              router.refresh();
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
            } finally {
              setBusy(false);
            }
          }}
        >{busy ? "Saving…" : "Save FAQs"}</Button>
      </div>
    </div>
  );
}
