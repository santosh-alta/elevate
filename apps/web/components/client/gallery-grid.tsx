"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass } from "../ui/button";
import type { Media } from "@/lib/types";
import { toGalleryPage, type GalleryPage } from "@/lib/gallery";

/** Public photo grid with "Load more" pagination through /events/:id/gallery?cursor=. */
export function GalleryGrid({ eventId, initial }: { eventId: string; initial: GalleryPage }) {
  const [items, setItems] = useState<Media[]>(initial.items);
  const [cursor, setCursor] = useState<string | null | undefined>(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  async function more() {
    if (!cursor) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/proxy/events/${eventId}/gallery?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("Could not load more photos");
      const page = toGalleryPage(await res.json());
      setItems((prev) => [...prev, ...page.items.filter((m) => !prev.some((p) => p.id === m.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const current = open !== null ? items[open] : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((m, i) => (
          <button
            key={m.id} type="button" onClick={() => setOpen(i)}
            className={`group relative overflow-hidden rounded-lg ${i === 0 && m.isHighlight ? "col-span-2 row-span-2" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.caption ?? m.title ?? "Event photo"} loading="lazy" className="aspect-square h-full w-full object-cover transition group-hover:scale-105" />
            {m.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-xs text-white">{m.caption}</span>}
          </button>
        ))}
      </div>
      {cursor && (
        <div className="text-center">
          <button type="button" onClick={more} disabled={busy} className={buttonClass("outline", "sm")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Load more photos
          </button>
        </div>
      )}
      {err && <p className="text-center text-sm text-red-600">{err}</p>}
      {current && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.caption ?? "Event photo"} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3 text-sm text-white">
            <button type="button" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25" onClick={(e) => { e.stopPropagation(); setOpen((o) => (o! > 0 ? o! - 1 : o)); }} disabled={open === 0}>‹ Prev</button>
            <span className="max-w-[50vw] truncate">{current.caption ?? `${open! + 1} / ${items.length}`}</span>
            <a href={current.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">Open</a>
            <button type="button" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25" onClick={(e) => { e.stopPropagation(); setOpen((o) => (o! < items.length - 1 ? o! + 1 : o)); }} disabled={open === items.length - 1}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
