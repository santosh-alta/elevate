"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeOff, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { callApi } from "@/components/client/api";
import { RichTextEditor } from "@/components/client/rich-text-editor";
import { UploadField } from "@/components/client/uploader";
import { Badge, Button, Field, FieldGroup, Input, Select, buttonClass } from "@/components/ui";
import { fmtDateTime, toLocalInput } from "@/lib/format";
import type { Attachment, ProblemStatement, Track } from "@/lib/types";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

interface Draft {
  code: string; title: string; html: string; trackId: string; difficulty: string; sponsorName: string;
  releaseAt: string; attachments: (Attachment & { _k: string })[]; sortOrder: number;
}
const k = () => Math.random().toString(36).slice(2);

function toDraft(p?: ProblemStatement, sortOrder = 0): Draft {
  return {
    code: p?.code ?? "", title: p?.title ?? "", html: p?.html ?? "", trackId: p?.trackId ?? "",
    difficulty: p?.difficulty ?? "", sponsorName: p?.sponsorName ?? "", releaseAt: toLocalInput(p?.releaseAt),
    attachments: (Array.isArray(p?.attachments) ? p!.attachments! : []).map((a) => ({ ...a, _k: k() })), sortOrder: p?.sortOrder ?? sortOrder,
  };
}

export function ProblemStatementsManager({ eventId, items, tracks }: { eventId: string; items: ProblemStatement[]; tracks: Track[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(items.length ? null : "new");
  const sorted = items.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.code ?? "").localeCompare(b.code ?? ""));
  const nextCode = `PS-${String(items.length + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {sorted.map((p) => {
          const hidden = p.releaseAt && new Date(p.releaseAt).getTime() > Date.now();
          return (
            <li key={p.id} className="rounded-lg border border-border">
              {editing === p.id ? (
                <Editor eventId={eventId} tracks={tracks} initial={toDraft(p)} id={p.id} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.code && <span className="font-mono text-xs font-semibold text-primary">{p.code}</span>}
                      <p className="font-medium">{p.title}</p>
                      {p.difficulty && <Badge tone={p.difficulty === "Hard" ? "red" : p.difficulty === "Medium" ? "amber" : "green"}>{p.difficulty}</Badge>}
                      {p.trackId && <Badge tone="primary">{tracks.find((t) => t.id === p.trackId)?.name ?? "Track"}</Badge>}
                      {p.sponsorName && <Badge tone="purple">by {p.sponsorName}</Badge>}
                      {hidden && <Badge tone="gray"><EyeOff className="h-3 w-3" />Hidden until {fmtDateTime(p.releaseAt)}</Badge>}
                    </div>
                    {(p.attachments?.length ?? 0) > 0 && (
                      <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                        {p.attachments!.map((a, i) => <a key={i} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary"><Paperclip className="h-3 w-3" />{a.label || "Attachment"}</a>)}
                      </p>
                    )}
                  </div>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing(p.id)}><Pencil className="h-4 w-4" />Edit</button>
                  <button
                    type="button" aria-label="Delete" className={buttonClass("ghost", "sm", "text-red-600")}
                    onClick={async () => {
                      if (!window.confirm(`Delete “${p.title}”? Teams that picked it will be unlinked.`)) return;
                      try { await callApi("DELETE", `/problem-statements/${p.id}`); router.refresh(); } catch (e) { window.alert((e as Error).message); }
                    }}
                  ><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editing === "new" ? (
        <div className="rounded-lg border border-primary/40">
          <Editor
            eventId={eventId} tracks={tracks} initial={{ ...toDraft(undefined, items.length + 1), code: nextCode }}
            onDone={() => { setEditing(null); router.refresh(); }} onCancel={items.length ? () => setEditing(null) : undefined}
          />
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add problem statement</Button>
      )}
    </div>
  );
}

function Editor({ eventId, tracks, initial, id, onDone, onCancel }: {
  eventId: string; tracks: Track[]; initial: Draft; id?: string; onDone: () => void; onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const setAtt = (i: number, patch: Partial<Attachment>) => set({ attachments: d.attachments.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  async function save() {
    if (!d.title.trim()) { setErr("Give it a title."); return; }
    setBusy(true); setErr(null);
    const body = {
      code: d.code.trim() || undefined,
      title: d.title.trim(),
      html: d.html,
      trackId: d.trackId || (id ? null : undefined),
      difficulty: d.difficulty || (id ? null : undefined),
      sponsorName: d.sponsorName.trim() || (id ? null : undefined),
      attachments: d.attachments.filter((a) => a.url.trim()).map((a) => ({ label: a.label.trim() || "Attachment", url: a.url.trim() })),
      releaseAt: d.releaseAt ? new Date(d.releaseAt).toISOString() : id ? null : undefined,
      sortOrder: d.sortOrder,
    };
    try {
      await callApi(id ? "PATCH" : "POST", id ? `/problem-statements/${id}` : `/events/${eventId}/problem-statements`, body);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <Field label="Code"><Input value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="PS-01" className="font-mono" /></Field>
        <Field label="Title"><Input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Smart attendance for rural schools" required /></Field>
      </div>
      <FieldGroup label="Problem statement" hint="Background, what to build, expected deliverables, data sets…">
        <RichTextEditor defaultValue={initial.html} onChange={(html) => set({ html })} eventId={eventId} placeholder="Describe the problem…" />
      </FieldGroup>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Track">
          <Select value={d.trackId} onChange={(e) => set({ trackId: e.target.value })}>
            <option value="">No track</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Difficulty">
          <Select value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
            <option value="">—</option>
            {DIFFICULTIES.map((x) => <option key={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="Sponsor"><Input value={d.sponsorName} onChange={(e) => set({ sponsorName: e.target.value })} placeholder="Optional" /></Field>
        <Field label="Hidden until" hint="Empty = visible now"><Input type="datetime-local" value={d.releaseAt} onChange={(e) => set({ releaseAt: e.target.value })} /></Field>
      </div>
      <FieldGroup label="Attachments" hint="Data sets, PDFs, API docs">
        <div className="space-y-2">
          {d.attachments.map((a, i) => (
            <div key={a._k} className="grid items-start gap-2 sm:grid-cols-[180px_1fr_auto]">
              <Input value={a.label} onChange={(e) => setAtt(i, { label: e.target.value })} placeholder="Label" aria-label="Attachment label" />
              <UploadField defaultValue={a.url} image={false} accept="image/*,application/pdf" fields={{ eventId }} onChange={(url) => setAtt(i, { url })} />
              <button type="button" aria-label="Remove attachment" className={buttonClass("ghost", "sm", "h-9")} onClick={() => set({ attachments: d.attachments.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ attachments: [...d.attachments, { label: "", url: "", _k: k() }] })}><Paperclip className="h-3.5 w-3.5" />Add attachment</Button>
        </div>
      </FieldGroup>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : id ? "Save changes" : "Add problem statement"}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}
