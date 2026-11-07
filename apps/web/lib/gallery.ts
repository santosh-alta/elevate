import type { Media } from "./types";

export interface GalleryPage { items: Media[]; nextCursor?: string | null }

/** Accepts `{ items, nextCursor }` (contract) or a bare array. */
export function toGalleryPage(raw: unknown): GalleryPage {
  if (Array.isArray(raw)) return { items: raw as Media[], nextCursor: null };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const items = (o.items ?? o.data ?? o.media ?? []) as Media[];
    return { items: Array.isArray(items) ? items : [], nextCursor: (o.nextCursor ?? o.cursor ?? null) as string | null };
  }
  return { items: [], nextCursor: null };
}
