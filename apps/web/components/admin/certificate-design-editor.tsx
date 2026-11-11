"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Eye, FileImage, Palette } from "lucide-react";
import { callApi } from "@/components/client/api";
import { UploadField } from "@/components/client/uploader";
import { Button, Select, buttonClass } from "@/components/ui";
import { cn } from "@/components/ui/cn";

export type CertificateDesign = {
  backgroundUrl: string; nameFont: "script" | "serif" | "sans"; color: string; nameY: number; line: "none" | "award" | "full"; corner: "right" | "left";
};
export type DesignMap = Partial<Record<string, CertificateDesign>>;

const TARGETS = [
  { key: "ALL", label: "All certificates" },
  { key: "PARTICIPATION", label: "Participation" },
  { key: "WINNER", label: "Winner" },
  { key: "RUNNER_UP", label: "Runner-up" },
  { key: "SPECIAL_MENTION", label: "Special mention" },
  { key: "FINALIST", label: "Finalist" },
  { key: "SPEAKER", label: "Speaker" },
  { key: "JUDGE", label: "Judge" },
  { key: "VOLUNTEER", label: "Volunteer" },
  { key: "MENTOR", label: "Mentor" },
];

const DEFAULT: Omit<CertificateDesign, "backgroundUrl"> = { nameFont: "script", color: "#14123a", nameY: 0.5, line: "award", corner: "right" };
const FONT_CLASS = { script: "font-serif italic", serif: "font-serif", sans: "font-sans font-bold" } as const;

/**
 * Pick the certificate look: the standard design, or your own artwork with the name, QR code, ID and issue date
 * printed on top. Used for the whole brand (Settings) or for one event (event → Certificates).
 */
export function CertificateDesignEditor({
  eventId, initial, inherited, canEdit = true,
}: { eventId?: string; initial: DesignMap; inherited?: DesignMap; canEdit?: boolean }) {
  const router = useRouter();
  const [designs, setDesigns] = useState<DesignMap>(initial);
  const [target, setTarget] = useState("ALL");
  const saved = designs[target];
  const [draft, setDraft] = useState<CertificateDesign | null>(saved ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? null);
  const path = eventId ? `/events/${eventId}/certificate-designs` : "/certificate-designs";

  // What this target uses when nothing is set here (for an event: the brand's design, else standard).
  const fallback = target !== "ALL" && designs.ALL ? "this event's design for all certificates"
    : inherited?.[target] || inherited?.ALL ? "the brand's own design (Settings)"
      : target !== "ALL" ? (eventId ? "the standard design" : "the brand's design for all certificates, or the standard one") : "the standard design";

  function pick(t: string) {
    setTarget(t); setDraft(designs[t] ?? null); setMsg(null);
  }

  async function save(design: CertificateDesign | null) {
    setBusy(true); setMsg(null);
    try {
      const next = await callApi<DesignMap>("PUT", path, { type: target, design });
      setDesigns(next); setDraft(next[target] ?? null);
      setMsg({ ok: true, text: design ? "Saved. Open a preview to check it." : "Back to the standard design." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  const previewType = target === "ALL" ? "PARTICIPATION" : target;
  const previewHref = `/api/proxy/certificate-designs/preview.pdf?type=${previewType}${eventId ? `&eventId=${eventId}` : ""}`;
  const set = (patch: Partial<CertificateDesign>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-bg/60 p-4">
        <div className="max-w-xl text-sm">
          <p className="font-semibold">Working with a designer?</p>
          <p className="text-muted">Send them the template. It shows the size to export and the areas to keep empty; we print the name, QR code, certificate ID and issue date there.</p>
        </div>
        <a href="/api/proxy/certificate-designs/guide.pdf" className={buttonClass("outline", "sm")} download><Download className="h-4 w-4" />Designer template (PDF)</a>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Applies to</p>
        <div className="flex flex-wrap gap-1.5">
          {TARGETS.map((t) => (
            <button
              key={t.key} type="button" onClick={() => pick(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                target === t.key ? "border-primary bg-primary text-white" : "border-border bg-card hover:border-primary/50",
              )}
            >
              {t.label}{designs[t.key] && <FileImage className="h-3 w-3" aria-label="own design" />}
            </button>
          ))}
        </div>
      </div>

      <div className="inline-flex rounded-brand border border-border bg-bg p-1 text-sm" role="radiogroup" aria-label="Design">
        {([[false, "Standard design"], [true, "Our own design"]] as const).map(([own, label]) => (
          <button
            key={label} type="button" role="radio" aria-checked={!!draft === own} disabled={!canEdit}
            onClick={() => setDraft(own ? draft ?? saved ?? { backgroundUrl: "", ...DEFAULT } : null)}
            className={cn("rounded-[calc(var(--radius)-4px)] px-4 py-1.5 font-medium", !!draft === own ? "bg-card text-primary shadow-sm" : "text-muted")}
          >{label}</button>
        ))}
      </div>

      {!draft && <p className="text-sm text-muted">{saved ? "Switching back removes the uploaded design for this choice." : `Uses ${fallback}.`}</p>}

      {draft && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Live layout preview */}
          <div>
            <div className="relative aspect-[297/210] w-full overflow-hidden rounded-xl border border-border bg-bg shadow-soft">
              {draft.backgroundUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Upload your design to see it here</div>
              )}
              <div className="absolute inset-x-[12%] -translate-y-1/2 text-center" style={{ top: `${draft.nameY * 100}%`, color: draft.color }}>
                <p className={cn("truncate text-[clamp(14px,3.6vw,34px)] leading-tight", FONT_CLASS[draft.nameFont])}>Aarav Sharma</p>
                {draft.line !== "none" && <p className="mt-1 truncate text-[clamp(8px,1.2vw,12px)] font-semibold opacity-90">{draft.line === "award" ? "First place · Team Byte Brigade (winners only)" : "for participating in Your Event · 12 October 2026"}</p>}
              </div>
              <div className={cn("absolute bottom-[5%] flex items-end gap-1.5", draft.corner === "left" ? "left-[3.6%] flex-row-reverse" : "right-[3.6%]")} style={{ color: draft.color }}>
                <div className={cn("text-[clamp(5px,0.8vw,8px)] leading-tight", draft.corner === "left" ? "text-left" : "text-right")}><p className="font-semibold">Certificate ID ALTA-7KQ2-M9XP</p><p>Issued 12 Oct 2026</p></div>
                <div className="h-[clamp(22px,7.5vw,62px)] w-[clamp(22px,7.5vw,62px)] rounded-sm bg-white p-0.5"><div className="h-full w-full bg-[repeating-linear-gradient(45deg,#111_0_2px,#fff_2px_4px)] opacity-80" /></div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Rough preview of where things go. Use <strong>Preview PDF</strong> after saving to see the real certificate.</p>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Design image</p>
              <UploadField
                key={target} defaultValue={draft.backgroundUrl} accept="image/png,image/jpeg" label="Upload design"
                fields={{ eventId }} onChange={(url) => set({ backgroundUrl: url })}
              />
              <p className="mt-1 text-xs text-muted">JPG or PNG, A4 landscape (3508 × 2480 px), under 4 MB, without any name on it.</p>
            </div>
            <label className="block text-sm font-medium">Name style
              <Select className="mt-1.5" value={draft.nameFont} onChange={(e) => set({ nameFont: e.target.value as CertificateDesign["nameFont"] })}>
                <option value="script">Script (handwritten)</option>
                <option value="serif">Serif (classic)</option>
                <option value="sans">Bold (modern)</option>
              </Select>
            </label>
            <label className="block text-sm font-medium">
              <span className="flex items-center gap-1.5"><Palette className="h-4 w-4" />Text colour</span>
              <span className="mt-1.5 flex items-center gap-2">
                <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-border bg-card" />
                <span className="font-mono text-xs text-muted">{draft.color}</span>
              </span>
            </label>
            <label className="block text-sm font-medium">Name position
              <input type="range" min={30} max={75} value={Math.round(draft.nameY * 100)} onChange={(e) => set({ nameY: Number(e.target.value) / 100 })} className="mt-2 w-full accent-[rgb(var(--primary))]" />
              <span className="flex justify-between text-xs text-muted"><span>Higher</span><span>{Math.round(draft.nameY * 100)}% from top</span><span>Lower</span></span>
            </label>
            <label className="block text-sm font-medium">Line under the name
              <Select className="mt-1.5" value={draft.line} onChange={(e) => set({ line: e.target.value as CertificateDesign["line"] })}>
                <option value="award">Team and award (winners only)</option>
                <option value="full">Full line: “for participating in …” and dates</option>
                <option value="none">Nothing (it's in the design)</option>
              </Select>
            </label>
            <label className="block text-sm font-medium">QR code, ID and issue date
              <Select className="mt-1.5" value={draft.corner ?? "right"} onChange={(e) => set({ corner: e.target.value as CertificateDesign["corner"] })}>
                <option value="right">Bottom-right corner</option>
                <option value="left">Bottom-left corner</option>
              </Select>
            </label>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            type="button" size="sm" disabled={busy || !dirty || (!!draft && !draft.backgroundUrl)}
            onClick={() => void save(draft)}
          >{busy ? "Saving…" : "Save design"}</Button>
          <a
            href={previewHref} target="_blank" rel="noreferrer"
            className={cn(buttonClass("outline", "sm"), dirty && "pointer-events-none opacity-50")}
            aria-disabled={dirty}
          ><Eye className="h-4 w-4" />Preview PDF</a>
          {dirty && <span className="text-xs text-muted">Save first to preview</span>}
          {msg && <span className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
