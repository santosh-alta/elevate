"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { PAGE_SECTION_TEMPLATES } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { RichTextEditor } from "@/components/client/rich-text-editor";
import { Button, Input, buttonClass } from "@/components/ui";
import type { PageSection } from "@/lib/types";

const GENERIC_TEMPLATES = [
  { title: "Eligibility", html: "" }, { title: "Timeline", html: "" }, { title: "Prizes", html: "" },
  { title: "Rules", html: "" }, { title: "Judging", html: "" }, { title: "Schedule", html: "" }, { title: "Highlights", html: "" },
];

function newId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Extra page sections (Eligibility, Timeline, Prizes, Rules…) written in the rich-text editor. */
export function PageSectionsEditor({ eventId, eventType, initial }: { eventId: string; eventType: string; initial: PageSection[] }) {
  const router = useRouter();
  const [items, setItems] = useState<PageSection[]>(initial);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const templates = PAGE_SECTION_TEMPLATES[eventType] ?? GENERIC_TEMPLATES;
  const unused = templates.filter((t) => !items.some((i) => i.title.toLowerCase() === t.title.toLowerCase()));

  const change = (next: PageSection[]) => { setItems(next); setDirty(true); setMsg(null); };
  const set = (id: string, patch: Partial<PageSection>) => change(items.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const add = (title: string, html: string) => {
    const s = { id: newId(), title, html };
    change([...items, s]);
    setOpen(s.id);
  };

  return (
    <div className="space-y-3">
      {items.map((s, i) => (
        <div key={s.id} className="rounded-lg border border-border">
          <div className="flex items-center gap-2 p-2">
            <button type="button" className={buttonClass("ghost", "sm", "h-9 px-2")} aria-label={open === s.id ? "Collapse" : "Expand"} onClick={() => setOpen(open === s.id ? null : s.id)}>
              {open === s.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <Input value={s.title} onChange={(e) => set(s.id, { title: e.target.value })} aria-label={`Section ${i + 1} title`} className="h-9 font-medium" placeholder="Section title" />
            <button type="button" aria-label="Move up" className={buttonClass("ghost", "sm", "h-9")} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" aria-label="Move down" className={buttonClass("ghost", "sm", "h-9")} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
            <button
              type="button" aria-label="Delete section" className={buttonClass("ghost", "sm", "h-9 text-red-600")}
              onClick={() => { if (window.confirm(`Delete the “${s.title || "untitled"}” section?`)) change(items.filter((x) => x.id !== s.id)); }}
            ><Trash2 className="h-4 w-4" /></button>
          </div>
          {open === s.id && (
            <div className="border-t border-border p-2">
              <RichTextEditor key={s.id} defaultValue={s.html} onChange={(html) => set(s.id, { html })} eventId={eventId} placeholder={`Write the ${s.title || "section"}…`} minHeight="9rem" ai={{ kind: "section", eventId, sectionTitle: s.title }} />
            </div>
          )}
        </div>
      ))}
      {!items.length && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">No sections yet. Start from a template below or add a blank one.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {unused.map((t) => (
          <Button key={t.title} type="button" variant="outline" size="sm" onClick={() => add(t.title, t.html)}><Plus className="h-3.5 w-3.5" />{t.title}</Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => add("New section", "")}><Plus className="h-3.5 w-3.5" />Blank section</Button>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
        {dirty && !msg && <span className="text-xs text-muted">Unsaved changes</span>}
        <Button
          type="button" size="sm" disabled={busy || items.some((s) => !s.title.trim())}
          onClick={async () => {
            setBusy(true); setMsg(null);
            try {
              await callApi("PATCH", `/events/${eventId}`, {
                pageSections: items.map((s) => ({ id: s.id, title: s.title.trim(), html: s.html ?? "", ...(s.icon ? { icon: s.icon } : {}) })),
              });
              setDirty(false);
              setMsg({ ok: true, text: "Sections saved" });
              router.refresh();
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
            } finally {
              setBusy(false);
            }
          }}
        >{busy ? "Saving…" : "Save sections"}</Button>
      </div>
    </div>
  );
}
