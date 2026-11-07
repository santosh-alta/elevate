"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookmarkPlus, Plus, X } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Badge, Button, Input, Select } from "@/components/ui";
import type { Library } from "@/lib/judging";

/**
 * Suggested remarks judges can tick: built-in + brand library (shared by every event) and this event's own list
 * (`config.judgeComments`).
 */
export function CommentsManager({ eventId, config, eventComments, library }: {
  eventId: string; config: Record<string, unknown>; eventComments: string[]; library: Library["comments"];
}) {
  const router = useRouter();
  const [items, setItems] = useState<string[]>(eventComments);
  const [text, setText] = useState("");
  const [libText, setLibText] = useState("");
  const [libCat, setLibCat] = useState("Positive");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const categories = [...new Set(["Positive", "Improve", ...library.map((c) => c.category)])];

  async function saveEvent(next: string[]) {
    setItems(next); setBusy(true); setMsg(null);
    try {
      await callApi("PATCH", `/events/${eventId}`, { config: { ...config, judgeComments: next } });
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    } catch (e) {
      setItems(items);
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }
  async function addLibrary(textValue: string, category: string) {
    setBusy(true); setMsg(null);
    try {
      await callApi("POST", "/judging/library", { kind: "COMMENT", name: textValue.trim(), category });
      setLibText("");
      setMsg({ ok: true, text: "Added to brand library" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }
  async function removeLibrary(id: string) {
    setBusy(true);
    try { await callApi("DELETE", `/judging/library/${id}`); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">For this event</p>
          <p className="text-xs text-muted">Shown to judges in addition to the library.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {items.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg py-1 pl-3 pr-1 text-sm">
              {c}
              <button type="button" aria-label={`Save “${c}” to brand library`} title="Save to brand library" className="rounded-full p-0.5 text-muted hover:bg-fg/5 hover:text-primary" disabled={busy} onClick={() => addLibrary(c, "Positive")}><BookmarkPlus className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Remove “${c}”`} className="rounded-full p-0.5 text-muted hover:bg-fg/5 hover:text-red-600" disabled={busy} onClick={() => saveEvent(items.filter((x) => x !== c))}><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          {!items.length && <li className="text-sm text-muted">None yet.</li>}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t && !items.includes(t)) { void saveEvent([...items, t]); setText(""); } }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Great use of the sponsor API" aria-label="New suggested comment" className="h-9" />
          <Button type="submit" size="sm" className="h-9" disabled={busy || !text.trim()}><Plus className="h-4 w-4" />Add</Button>
        </form>
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Brand library</p>
          <p className="text-xs text-muted">Available to judges at every event.</p>
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {categories.map((cat) => {
            const list = library.filter((c) => c.category === cat);
            if (!list.length) return null;
            return (
              <div key={cat}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {list.map((c) => (
                    <li key={(c.id ?? "") + c.text} className="inline-flex items-center gap-1 rounded-full bg-fg/5 px-2.5 py-0.5 text-xs">
                      {c.text}
                      {!c.builtIn && <Badge tone="purple" className="px-1 py-0 text-[9px]">Brand</Badge>}
                      {!c.builtIn && c.id && <button type="button" aria-label={`Remove “${c.text}” from library`} className="text-muted hover:text-red-600" disabled={busy} onClick={() => removeLibrary(c.id!)}><X className="h-3 w-3" /></button>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (libText.trim()) void addLibrary(libText, libCat); }}>
          <Input value={libText} onChange={(e) => setLibText(e.target.value)} placeholder="Add to brand library" aria-label="New library comment" className="h-9" />
          <Select value={libCat} onChange={(e) => setLibCat(e.target.value)} className="h-9 w-28 text-xs" aria-label="Category">
            <option>Positive</option><option>Improve</option>
          </Select>
          <Button type="submit" size="sm" variant="outline" className="h-9" disabled={busy || !libText.trim()}>Add</Button>
        </form>
      </div>
    </div>
  );
}
