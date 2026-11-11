"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { callApi } from "@/components/client/api";
import { UploadField } from "@/components/client/uploader";
import { Button, buttonClass } from "@/components/ui";
import { cn } from "@/components/ui/cn";

export type TicketDesign = { backgroundUrl: string; color: string; stubColor: string; details: boolean };

/**
 * Ticket look: the standard ticket, or your own artwork (2480 × 1167 px) with the attendee's name, team,
 * QR code and ticket number printed on it. For the whole brand (Settings) or one event (Registrations tab).
 */
export function TicketDesignEditor({
  eventId, initial, inherited, canEdit = true,
}: { eventId?: string; initial: TicketDesign | null; inherited?: TicketDesign | null; canEdit?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState<TicketDesign | null>(initial);
  const [draft, setDraft] = useState<TicketDesign | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (p: Partial<TicketDesign>) => setDraft((d) => (d ? { ...d, ...p } : d));

  async function save(design: TicketDesign | null) {
    setBusy(true); setMsg(null);
    try {
      const r = await callApi<{ design: TicketDesign | null }>("PUT", eventId ? `/events/${eventId}/ticket-design` : "/ticket-design", { design });
      setSaved(r.design); setDraft(r.design);
      setMsg({ ok: true, text: design ? "Saved. Open a preview to check it." : "Back to the standard ticket." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  const preview = `/api/proxy/ticket-design/preview.pdf${eventId ? `?eventId=${eventId}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-bg/60 p-4">
        <div className="max-w-xl text-sm">
          <p className="font-semibold">Ticket size: 2480 × 1167 px (JPG or PNG, under 4 MB)</p>
          <p className="text-muted">Send the template to your designer. It marks where we print the name, team, QR code and ticket number.</p>
        </div>
        <a href="/api/proxy/ticket-design/guide.pdf" className={buttonClass("outline", "sm")} download><Download className="h-4 w-4" />Ticket template (PDF)</a>
      </div>

      <div className="inline-flex rounded-brand border border-border bg-bg p-1 text-sm" role="radiogroup" aria-label="Ticket design">
        {([[false, "Standard ticket"], [true, "Our own design"]] as const).map(([own, label]) => (
          <button
            key={label} type="button" role="radio" aria-checked={!!draft === own} disabled={!canEdit}
            onClick={() => setDraft(own ? draft ?? saved ?? { backgroundUrl: "", color: "#14123a", stubColor: "#14123a", details: false } : null)}
            className={cn("rounded-[calc(var(--radius)-4px)] px-4 py-1.5 font-medium", !!draft === own ? "bg-card text-primary shadow-sm" : "text-muted")}
          >{label}</button>
        ))}
      </div>
      {!draft && <p className="text-sm text-muted">{eventId && inherited ? "Uses the brand's ticket design (Settings)." : "Uses the standard ticket in your brand colours."}</p>}

      {draft && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="relative aspect-[2480/1167] w-full overflow-hidden rounded-xl border border-border bg-bg shadow-soft">
              {draft.backgroundUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Upload your ticket design to see it here</div>}
              {draft.details && (
                <div className="absolute left-[4.7%] top-[33%] max-w-[60%]" style={{ color: draft.color }}>
                  <p className="text-[clamp(9px,1.9vw,17px)] font-bold leading-tight">Your Event Title</p>
                  <p className="mt-1 text-[clamp(6px,1vw,10px)] opacity-90">Sat, 21 Nov 2026 · 10:00 am – 6:00 pm · Venue</p>
                </div>
              )}
              <div className="absolute bottom-[8%] left-[4.7%] text-[clamp(6px,1.1vw,11px)] leading-tight" style={{ color: draft.color }}>
                <p className="opacity-70">ATTENDEE</p><p className="text-[clamp(8px,1.4vw,13px)] font-bold">Aarav Sharma</p>
              </div>
              <div className="absolute inset-y-0 right-0 flex w-[32%] flex-col items-center justify-center gap-1" style={{ color: draft.stubColor }}>
                <div className="aspect-square w-[60%] rounded-sm bg-white p-1"><div className="h-full w-full bg-[repeating-linear-gradient(45deg,#111_0_2px,#fff_2px_4px)] opacity-80" /></div>
                <p className="text-[clamp(6px,1vw,10px)] font-bold">TZ6V3H8N</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Rough preview. Save, then use <strong>Preview PDF</strong> for the real ticket.</p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Ticket design image</p>
              <UploadField defaultValue={draft.backgroundUrl} accept="image/png,image/jpeg" label="Upload design" fields={{ eventId }} onChange={(url) => set({ backgroundUrl: url })} />
            </div>
            <label className="flex items-center justify-between gap-3 text-sm font-medium">Name text colour
              <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-border bg-card" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm font-medium">Stub text colour
              <input type="color" value={draft.stubColor} onChange={(e) => set({ stubColor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-border bg-card" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={draft.details} onChange={(e) => set({ details: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
              <span><span className="font-medium">Print event details</span><span className="block text-xs text-muted">Title, date, time and venue. Leave off if they're already in the design.</span></span>
            </label>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="button" size="sm" disabled={busy || !dirty || (!!draft && !draft.backgroundUrl)} onClick={() => void save(draft)}>{busy ? "Saving…" : "Save ticket design"}</Button>
          <a href={preview} target="_blank" rel="noreferrer" className={cn(buttonClass("outline", "sm"), dirty && "pointer-events-none opacity-50")}><Eye className="h-4 w-4" />Preview PDF</a>
          {dirty && <span className="text-xs text-muted">Save first to preview</span>}
          {msg && <span className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
