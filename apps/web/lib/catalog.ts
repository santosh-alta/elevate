import { apiGet, apiList, apiPublic, apiListPublic } from "./api";
import { builtInFamilies } from "./families";
import type { EventTypesFamily, EventTypesResponse, TagCount } from "./types";

export { builtInFamilies };

/** GET /event-types: families with built-in types + this brand's own types. `all` includes archived (staff). */
export async function getEventTypes(all = false): Promise<EventTypesFamily[]> {
  // Public pages share a cached copy; admin screens (all=true) always read fresh.
  const res = all ? await apiGet<EventTypesResponse>("/event-types?all=1") : await apiPublic<EventTypesResponse>("/event-types", 60);
  const fallback = builtInFamilies();
  if (!res?.families?.length) return fallback;
  // Keep shared metadata as the source of truth for order/labels; take custom types from the API.
  return fallback.map((f) => {
    const api = res.families.find((x) => x.key === f.key);
    return api ? { ...f, ...api, types: api.types?.length ? api.types : f.types, custom: api.custom ?? [] } : f;
  });
}

/** GET /tags → [{ tag, count }] (most used first). */
export async function getTags(all = false): Promise<TagCount[]> {
  const list = all ? await apiList<TagCount | string>("/tags?all=1") : await apiListPublic<TagCount | string>("/tags", 60);
  return list.map((t) => (typeof t === "string" ? { tag: t, count: 0 } : t)).filter((t) => t && t.tag);
}
