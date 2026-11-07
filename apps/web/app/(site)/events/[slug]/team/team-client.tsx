"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crown, Link2, Loader2, Lock, Paperclip, Plus, Trash2, UserMinus, X } from "lucide-react";
import { callApi } from "@/components/client/api";
import { UploadField } from "@/components/client/uploader";
import { Badge, Button, Field, FieldGroup, Input, Select, Textarea, buttonClass } from "@/components/ui";
import type { Attachment, ProblemStatement, Team, Track } from "@/lib/types";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<unknown>, ok?: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return false;
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); router.refresh(); return true; }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" }); return false; }
    finally { setBusy(false); }
  }
  return { busy, msg, run };
}

const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p> : null;

/** Members list; the leader can add/remove while registration is open; a member can leave. */
export function TeamMembers({ team, meId, isLeader, canEdit, maxSize, eventSlug }: {
  team: Team; meId: string; isLeader: boolean; canEdit: boolean; maxSize: number; eventSlug: string;
}) {
  const router = useRouter();
  const { busy, msg, run } = useRun();
  const [adding, setAdding] = useState(false);
  const members = team.members ?? [];
  const full = members.length >= maxSize;

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            {m.isLeader ? <Crown className="h-4 w-4 text-primary" /> : <span className="h-4 w-4" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.user?.name ?? "Member"}{m.userId === meId && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}</p>
              {m.user?.email && <p className="truncate text-xs text-muted">{m.user.email}</p>}
            </div>
            {m.isLeader && <Badge tone="primary">Leader</Badge>}
            {canEdit && isLeader && !m.isLeader && (
              <button type="button" aria-label={`Remove ${m.user?.name ?? "member"}`} disabled={busy} className={buttonClass("ghost", "sm", "text-red-600")}
                onClick={() => run(() => callApi("DELETE", `/teams/${team.id}/members/${m.userId}`), "Member removed", `Remove ${m.user?.name ?? "this member"} from the team? Their registration will be cancelled.`)}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {!isLeader && m.userId === meId && (
              <button type="button" disabled={busy} className={buttonClass("ghost", "sm", "text-red-600")}
                onClick={async () => { const ok = await run(() => callApi("DELETE", `/teams/${team.id}/members/${m.userId}`), undefined, "Leave this team? Your registration for the event will be cancelled."); if (ok) router.push(`/events/${eventSlug}`); }}>
                <UserMinus className="h-4 w-4" />Leave
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && isLeader && !full && (
        adding ? (
          <form
            className="grid gap-2 rounded-lg border border-border bg-bg/50 p-3 sm:grid-cols-[1fr_1.2fr_0.8fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const body = { name: String(fd.get("name")).trim(), email: String(fd.get("email")).trim().toLowerCase(), ...(String(fd.get("phone") ?? "").trim() ? { phone: String(fd.get("phone")).trim() } : {}) };
              if (await run(() => callApi("POST", `/teams/${team.id}/members`, body), `${body.name} added — they'll get an email with their ticket.`)) setAdding(false);
            }}
          >
            <Input name="name" required placeholder="Name" aria-label="Member name" />
            <Input name="email" type="email" required placeholder="Email" aria-label="Member email" />
            <Input name="phone" type="tel" placeholder="Phone (optional)" aria-label="Member phone" />
            <div className="flex gap-1">
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button>
              <button type="button" aria-label="Cancel" className={buttonClass("ghost", "md", "px-2")} onClick={() => setAdding(false)}><X className="h-4 w-4" /></button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add member</Button>
        )
      )}
      {canEdit && isLeader && full && <p className="text-xs text-muted">Your team is full ({maxSize} members).</p>}
      {!canEdit && isLeader && <p className="text-xs text-muted">Registration is closed, so the team can no longer change.</p>}
      <Msg msg={msg} />
    </div>
  );
}

/** Leader picks (or changes) the team's problem statement and track. */
export function ProblemChoice({ team, problems, tracks, canEdit }: { team: Team; problems: ProblemStatement[]; tracks: Track[]; canEdit: boolean }) {
  const { busy, msg, run } = useRun();
  const [trackId, setTrackId] = useState(team.trackId ?? "");
  const [problemId, setProblemId] = useState(team.problemStatementId ?? team.problemStatement?.id ?? "");
  const list = problems.filter((p) => !trackId || !p.trackId || p.trackId === trackId);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {tracks.length > 0 && (
          <Field label="Track">
            <Select value={trackId} disabled={!canEdit} onChange={(e) => setTrackId(e.target.value)}>
              <option value="">No track</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Problem statement">
          <Select value={problemId} disabled={!canEdit || !list.length} onChange={(e) => setProblemId(e.target.value)}>
            <option value="">{list.length ? "Not chosen yet" : "None released yet"}</option>
            {list.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.title}</option>)}
          </Select>
        </Field>
      </div>
      {canEdit && (
        <Button type="button" size="sm" disabled={busy}
          onClick={() => run(() => callApi("PATCH", `/teams/${team.id}`, { trackId: trackId || null, problemStatementId: problemId || null }), "Saved")}>
          Save choice
        </Button>
      )}
      <Msg msg={msg} />
    </div>
  );
}

const SUGGESTED_TECH = ["React", "Next.js", "Flutter", "Node.js", "Python", "FastAPI", "Django", "PostgreSQL", "MongoDB", "Firebase", "OpenAI", "Claude", "TensorFlow", "Arduino"];

/** Project submission (links, tech stack chips, extra links / files) and the final Submit (lock). */
export function SubmissionForm({ team, eventId, windowOpen, windowNote, locked }: {
  team: Team; eventId: string; windowOpen: boolean; windowNote?: string; locked: boolean;
}) {
  const { busy, msg, run } = useRun();
  const [tech, setTech] = useState<string[]>(team.techStack ?? []);
  const [techInput, setTechInput] = useState("");
  const [atts, setAtts] = useState<(Attachment & { _k: string })[]>(() => (team.attachments ?? []).map((a) => ({ ...a, _k: Math.random().toString(36).slice(2) })));
  const disabled = locked || !windowOpen;
  const addTech = (t: string) => { const v = t.trim(); if (v && !tech.some((x) => x.toLowerCase() === v.toLowerCase())) setTech([...tech, v]); setTechInput(""); };
  const addAtt = (kind: "link" | "file") => setAtts([...atts, { label: "", url: "", kind, _k: Math.random().toString(36).slice(2) }]);

  function bodyFrom(form: HTMLFormElement) {
    const fd = new FormData(form);
    const v = (k: string) => String(fd.get(k) ?? "").trim() || null;
    return {
      projectTitle: v("projectTitle"), projectSummary: v("projectSummary"),
      repoUrl: v("repoUrl"), demoUrl: v("demoUrl"), deckUrl: v("deckUrl"), videoUrl: v("videoUrl"),
      techStack: tech,
      attachments: atts.filter((a) => a.url.trim()).map((a) => ({ label: a.label.trim() || (a.kind === "file" ? "File" : "Link"), url: a.url.trim(), kind: a.kind ?? "link" })),
    };
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); void run(() => callApi("PATCH", `/teams/${team.id}`, bodyFrom(e.currentTarget)), "Draft saved"); }}
    >
      {locked && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><Lock className="h-4 w-4" />Submitted and locked. Ask the organisers if you need to change something.</p>}
      {!locked && windowNote && <p className={`rounded-lg p-3 text-sm ${windowOpen ? "bg-primary/5 text-fg" : "bg-amber-50 text-amber-800"}`}>{windowNote}</p>}
      <fieldset disabled={disabled} className="space-y-4">
        <Field label="Project title"><Input name="projectTitle" defaultValue={team.projectTitle ?? ""} required placeholder="What's it called?" /></Field>
        <Field label="Summary" hint="The problem, your solution and what makes it work"><Textarea name="projectSummary" rows={5} defaultValue={team.projectSummary ?? ""} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="GitHub repo"><Input name="repoUrl" type="url" defaultValue={team.repoUrl ?? ""} placeholder="https://github.com/…" /></Field>
          <Field label="Live demo"><Input name="demoUrl" type="url" defaultValue={team.demoUrl ?? ""} placeholder="https://…" /></Field>
          <FieldGroup label="Pitch deck" hint="Link or upload a PDF"><UploadField name="deckUrl" defaultValue={team.deckUrl} image={false} accept="application/pdf,image/*" fields={{ eventId }} /></FieldGroup>
          <Field label="Demo video"><Input name="videoUrl" type="url" defaultValue={team.videoUrl ?? ""} placeholder="YouTube / Drive link" /></Field>
        </div>
        <FieldGroup label="Tech stack">
          <div className="flex flex-wrap gap-1.5">
            {tech.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-sm text-primary">
                {t}<button type="button" aria-label={`Remove ${t}`} onClick={() => setTech(tech.filter((x) => x !== t))} className="rounded-full p-0.5 hover:bg-primary/15"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <Input value={techInput} onChange={(e) => setTechInput(e.target.value)} placeholder="Type and press Enter" aria-label="Add technology"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTech(techInput); } }} />
          <div className="flex flex-wrap gap-1">
            {SUGGESTED_TECH.filter((s) => !tech.includes(s)).slice(0, 10).map((s) => (
              <button key={s} type="button" onClick={() => addTech(s)} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:border-primary hover:text-primary">+ {s}</button>
            ))}
          </div>
        </FieldGroup>
        <FieldGroup label="Extra links and files" hint="Docs, Figma, data sets, screenshots…">
          <div className="space-y-2">
            {atts.map((a) => (
              <div key={a._k} className="grid items-start gap-2 sm:grid-cols-[160px_1fr_auto]">
                <Input value={a.label} onChange={(e) => setAtts(atts.map((x) => (x._k === a._k ? { ...x, label: e.target.value } : x)))} placeholder="Label" aria-label="Label" />
                {a.kind === "file"
                  ? <UploadField defaultValue={a.url} image={false} accept="image/*,application/pdf" fields={{ eventId }} onChange={(url) => setAtts((cur) => cur.map((x) => (x._k === a._k ? { ...x, url } : x)))} />
                  : <Input value={a.url} type="url" onChange={(e) => setAtts(atts.map((x) => (x._k === a._k ? { ...x, url: e.target.value } : x)))} placeholder="https://…" aria-label="Link" />}
                <button type="button" aria-label="Remove" className={buttonClass("ghost", "sm", "h-10")} onClick={() => setAtts(atts.filter((x) => x._k !== a._k))}><X className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => addAtt("link")}><Link2 className="h-3.5 w-3.5" />Add link</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => addAtt("file")}><Paperclip className="h-3.5 w-3.5" />Upload file</Button>
            </div>
          </div>
        </FieldGroup>
      </fieldset>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button type="submit" variant="outline" disabled={busy}>Save draft</Button>
          <Button
            type="button" disabled={busy}
            onClick={async (e) => {
              const form = (e.currentTarget as HTMLButtonElement).form!;
              if (!form.reportValidity()) return;
              await run(async () => {
                await callApi("PATCH", `/teams/${team.id}`, bodyFrom(form));
                await callApi("POST", `/teams/${team.id}/submit`, {});
              }, "Submitted! Good luck.", "Submit your project? It will be locked and sent to the judges.");
            }}
          >
            <Lock className="h-4 w-4" />Submit final
          </Button>
        </div>
      )}
      <Msg msg={msg} />
    </form>
  );
}
