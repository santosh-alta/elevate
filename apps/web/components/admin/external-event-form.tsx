"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { callApi } from "@/components/client/api";
import { UploadField } from "@/components/client/uploader";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

export type ManualExternal = {
  id?: string; title: string; url: string; organizer?: string | null; summary?: string | null; imageUrl?: string | null; coverUrl?: string | null;
  startsAt?: string; endsAt?: string; registrationEndsAt?: string | null; mode?: string; location?: string | null; prize?: string | null;
  participants?: number | null; teamSize?: string | null; tags?: string[]; major?: boolean;
};

type Preview = { title?: string; summary?: string; imageUrl?: string; organizer?: string; platform?: string | null; startsAt?: string; endsAt?: string; location?: string; mode?: string };

/** "2026-12-01T18:29:00Z" → "2026-12-01" in India (for date fields). */
const dayIn = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");

/**
 * Add (or edit) an outside hackathon or competition by hand, from any site. Paste the link and
 * "Fill from link" reads the page's name, description, image and dates; check them and fill in the rest.
 */
export function ExternalEventForm({ initial, onDone }: { initial?: ManualExternal; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<ManualExternal>(() => initial ?? { title: "", url: "", mode: "ONLINE", tags: [] });
  const [busy, setBusy] = useState<"lookup" | "save" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [imageKey, setImageKey] = useState(0);
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  const set = <K extends keyof ManualExternal>(k: K, val: ManualExternal[K]) => setV((x) => ({ ...x, [k]: val }));

  async function lookup() {
    if (!v.url) { setMsg({ ok: false, text: "Paste the link first." }); return; }
    setBusy("lookup"); setMsg(null);
    try {
      const p = await callApi<Preview>("POST", "/admin/external-events/lookup", { url: v.url });
      setV((x) => ({
        ...x,
        title: x.title || p.title || "",
        summary: x.summary || p.summary || "",
        imageUrl: x.imageUrl || p.imageUrl || "",
        organizer: x.organizer || p.organizer || (p.platform && !/^(Unstop|Devfolio|Devpost|HackerEarth|Hack2skill)$/.test(p.platform) ? p.platform : "") || "",
        startsAt: x.startsAt || dayIn(p.startsAt),
        endsAt: x.endsAt || dayIn(p.endsAt),
        location: x.location || p.location || "",
        mode: p.mode ?? x.mode,
      }));
      setImageKey((k) => k + 1);
      const found = [p.title && "name", p.summary && "description", p.imageUrl && "image", p.startsAt && "dates"].filter(Boolean);
      setMsg({ ok: true, text: found.length ? `Filled ${found.join(", ")}${p.platform ? ` from ${p.platform}` : ""}. Check them and add the rest.` : "That page doesn't share its details. Please fill them in." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read that page." });
    } finally {
      setBusy(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save"); setMsg(null);
    const body = {
      ...v,
      participants: v.participants || null,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      startsAt: v.startsAt?.slice(0, 10), endsAt: v.endsAt?.slice(0, 10),
      registrationEndsAt: v.registrationEndsAt ? v.registrationEndsAt.slice(0, 10) : null,
    };
    try {
      if (v.id) await callApi("PUT", `/admin/external-events/${v.id}`, body);
      else await callApi("POST", "/admin/external-events", body);
      setMsg({ ok: true, text: v.id ? "Saved." : "Added. It's on the calendar now." });
      if (!v.id) { setV({ title: "", url: "", mode: "ONLINE", tags: [] }); setTagsText(""); setImageKey((k) => k + 1); }
      router.refresh();
      onDone?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Link to the event page" hint="Any site: HackerEarth, Hack2skill, Kaggle, a company or college page…">
        <div className="flex gap-2">
          <Input type="url" required value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" className="min-w-0 flex-1" />
          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={lookup} disabled={busy !== null}>
            {busy === "lookup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Fill from link
          </Button>
        </div>
      </Field>
      <Field label="Name"><Input required value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Smart India Hackathon 2027" /></Field>
      <Field label="Organiser"><Input value={v.organizer ?? ""} onChange={(e) => set("organizer", e.target.value)} placeholder="e.g. Ministry of Education, Google" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Starts"><Input type="date" required value={v.startsAt?.slice(0, 10) ?? ""} onChange={(e) => set("startsAt", e.target.value)} /></Field>
        <Field label="Ends"><Input type="date" required value={v.endsAt?.slice(0, 10) ?? ""} onChange={(e) => set("endsAt", e.target.value)} /></Field>
      </div>
      <Field label="Apply by" hint="Last day to register (shown as the deadline)"><Input type="date" value={v.registrationEndsAt?.slice(0, 10) ?? ""} onChange={(e) => set("registrationEndsAt", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mode">
          <Select value={v.mode ?? "ONLINE"} onChange={(e) => set("mode", e.target.value)}>
            <option value="ONLINE">Online</option><option value="OFFLINE">In person</option><option value="HYBRID">Hybrid</option>
          </Select>
        </Field>
        <Field label="City"><Input value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="If in person" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prize pool"><Input value={v.prize ?? ""} onChange={(e) => set("prize", e.target.value)} placeholder="₹1,00,000 in prizes" /></Field>
        <Field label="Team size"><Input value={v.teamSize ?? ""} onChange={(e) => set("teamSize", e.target.value)} placeholder="2–4 members / Solo" /></Field>
      </div>
      <Field label="Registered so far" hint="Optional, if the page shows it"><Input type="number" min={0} value={v.participants ?? ""} onChange={(e) => set("participants", e.target.value ? Number(e.target.value) : null)} /></Field>
      <Field label="About it" hint="2–3 sentences students will see on the preview card">
        <Textarea rows={4} value={v.summary ?? ""} onChange={(e) => set("summary", e.target.value)} placeholder="What it is, who can take part, what you build…" />
      </Field>
      <Field label="Topics" hint="Comma separated"><Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="AI, Web, Fintech" /></Field>
      <Field label="Logo or banner image">
        <UploadField key={imageKey} defaultValue={v.imageUrl} onChange={(url) => set("imageUrl", url)} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={!!v.major} onChange={(e) => set("major", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--primary))]" />
        <span>Mark as <b>Major</b> <span className="text-muted">(shows the trophy; use for big ones like Smart India Hackathon)</span></span>
      </label>
      {msg && <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.text}</p>}
      <Button type="submit" className="w-full" disabled={busy !== null}>{busy === "save" ? "Saving…" : v.id ? "Save changes" : "Add to calendar"}</Button>
    </form>
  );
}

/** "Edit" on a team-added listing: opens the same form, filled in. */
export function ExternalEditButton({ item }: { item: ManualExternal }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</Button>
      {open && (
        <div className="basis-full rounded-xl border border-border bg-bg p-4">
          <ExternalEventForm initial={item} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
