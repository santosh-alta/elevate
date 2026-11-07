import { apiGet, apiList } from "./api";
import { builtInFamilies } from "./families";
import type { EventTypesFamily, EventTypesResponse, TagCount } from "./types";

export { builtInFamilies };

/** GET /event-types: families with built-in types + this brand's own types. `all` includes archived (staff). */
export async function getEventTypes(all = false): Promise<EventTypesFamily[]> {
  const res = await apiGet<EventTypesResponse>(`/event-types${all ? "?all=1" : ""}`);
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
  const list = await apiList<TagCount | string>(`/tags${all ? "?all=1" : ""}`);
  return list.map((t) => (typeof t === "string" ? { tag: t, count: 0 } : t)).filter((t) => t && t.tag);
}
