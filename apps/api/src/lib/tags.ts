import { familyOf, type EventType } from "@elevate/shared";
import { prisma } from "../plugins/prisma";

export const MAX_TAGS = 15;

/** Trims, drops empties and de-duplicates case-insensitively (first spelling wins); at most 15 tags. */
export function normalizeTags(...lists: (readonly string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
  }
  return out.slice(0, MAX_TAGS);
}

/** Splits `tag` query values: repeatable and/or comma-separated. */
export function parseTagQuery(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return normalizeTags((Array.isArray(value) ? value : [value]).flatMap((v) => v.split(",")));
}

/**
 * The exact stored spellings of the given tags on a brand's events (tags are stored as typed,
 * so `?tag=ai` must match events tagged "AI").
 */
export async function storedTagSpellings(tenantId: string, tags: string[]): Promise<string[]> {
  if (!tags.length) return [];
  const lower = tags.map((t) => t.toLowerCase());
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT t AS tag
    FROM "Event" e, unnest(e."tags") AS t
    WHERE e."tenantId" = ${tenantId} AND lower(t) = ANY(${lower}::text[])`;
  return [...new Set([...tags, ...rows.map((r) => r.tag)])];
}

/** Prisma select/include fragment for the event's brand type. */
export const CATEGORY_SELECT = { select: { id: true, name: true, icon: true } } as const;

/** `family`, `category` and `tags` for an event payload. */
export function eventMeta(e: { type: string; tags?: string[] | null; category?: { id: string; name: string; icon: string | null } | null }) {
  return {
    family: familyOf(e.type as EventType),
    category: e.category ?? null,
    tags: e.tags ?? [],
  };
}
