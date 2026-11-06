"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileText, ImagePlus, Upload, X } from "lucide-react";
import { buttonClass } from "../ui/button";
import { cn } from "../ui/cn";
import { MAX_UPLOAD_BYTES, uploadFile, type UploadResult } from "./upload";

interface Item { id: string; name: string; preview?: string; pct: number; error?: string; done?: boolean }

/**
 * Drag-and-drop multi-file uploader with per-file progress and image previews.
 * Posts each file to `path` (default /uploads) with `fields` (eventId, kind, caption…), then refreshes the page.
 */
export function PhotoUploader({
  path = "/uploads", fields = {}, accept = "image/*", multiple = true, label = "Drop photos here or click to choose",
  hint = "JPG, PNG or WebP, up to 15 MB each", onUploaded, refresh = true, className,
}: {
  path?: string; fields?: Record<string, string | undefined>; accept?: string; multiple?: boolean; label?: string; hint?: string;
  onUploaded?: (r: UploadResult, file: File) => void; refresh?: boolean; className?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const fresh: Item[] = list.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`, name: f.name, pct: 0,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      error: f.size > MAX_UPLOAD_BYTES ? "Larger than 15 MB" : undefined,
    }));
    setItems((prev) => [...fresh, ...prev]);
    const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    let any = false;
    await Promise.all(list.map(async (file, i) => {
      const it = fresh[i];
      if (it.error) return;
      try {
        const r = await uploadFile(path, file, fields, (pct) => update(it.id, { pct }));
        update(it.id, { done: true, pct: 100 });
        any = true;
        onUploaded?.(r, file);
      } catch (e) {
        update(it.id, { error: e instanceof Error ? e.message : "Upload failed" });
      }
    }));
    if (any && refresh) router.refresh();
  }

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files); }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-brand border-2 border-dashed px-4 py-8 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-bg",
        )}
      >
        <ImagePlus className="h-7 w-7 text-primary" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
      <input
        ref={input} type="file" accept={accept} multiple={multiple} className="hidden"
        onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ""; }}
      />
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((it) => (
            <li key={it.id} className="relative overflow-hidden rounded-lg border border-border bg-card">
              {it.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.preview} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-bg"><FileText className="h-6 w-6 text-muted" /></div>
              )}
              <div className="space-y-1 p-2">
                <p className="truncate text-xs" title={it.name}>{it.name}</p>
                {it.error ? (
                  <p className="text-[11px] text-red-600">{it.error}</p>
                ) : (
                  <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
                    <div className={cn("h-full rounded-full transition-all", it.done ? "bg-emerald-500" : "bg-primary")} style={{ width: `${it.pct}%` }} />
                  </div>
                )}
              </div>
              {(it.done || it.error) && (
                <button type="button" aria-label="Dismiss" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Single-file upload bound to a form field: shows the current image/link, uploads a new file and stores
 * the resulting URL in a hidden input named `name` (so ApiForm / FormData pick it up). Also allows pasting a URL.
 */
export function UploadField({
  name, defaultValue, path = "/uploads", fields = {}, accept = "image/*", label = "Upload", image = true, onChange,
}: {
  name?: string; defaultValue?: string | null; path?: string; fields?: Record<string, string | undefined>;
  accept?: string; label?: string; image?: boolean; onChange?: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultValue ?? "");
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (v: string) => { setUrl(v); onChange?.(v); };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {image && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover" />
        ) : image ? (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted"><ImagePlus className="h-5 w-5" /></div>
        ) : null}
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="text" inputMode="url" value={url} placeholder="https://… or upload" onChange={(e) => set(e.target.value)} aria-label="File link"
            className="h-9 min-w-0 flex-1 rounded-brand border border-border bg-card px-3 text-sm focus:border-primary focus:outline-none"
          />
          <button type="button" className={buttonClass("outline", "sm", "h-9")} disabled={pct !== null && pct < 100} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" />{pct !== null && pct < 100 ? `${pct}%` : label}
          </button>
        </div>
      </div>
      {name && <input type="hidden" name={name} value={url} data-keep-empty />}
      <input
        ref={input} type="file" accept={accept} className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > MAX_UPLOAD_BYTES) { setErr("File is larger than 15 MB"); return; }
          setErr(null); setPct(0);
          try {
            const r = await uploadFile(path, f, fields, setPct);
            set(r.url);
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Upload failed");
          } finally {
            setPct(null);
          }
        }}
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
