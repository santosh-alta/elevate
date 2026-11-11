import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { API_BASE } from "./config";
import type { Tenant } from "./types";

/** Host the visitor used (e.g. event.sunstone.in), forwarded by middleware. */
export const getHost = cache(async (): Promise<string> => {
  const h = await headers();
  return h.get("x-elevate-host") ?? h.get("x-forwarded-host") ?? h.get("host") ?? "";
});

/** Headers that tell the API which brand a host belongs to (no request needed, so pages can be pre-built). */
export function hostHeaders(host: string): Record<string, string> {
  const out: Record<string, string> = { "X-Forwarded-Host": host };
  const hostname = host.split(":")[0];
  const local = hostname.match(/^([a-z0-9-]+)\.localhost$/i);
  if (process.env.DEV_TENANT) out["X-Tenant"] = process.env.DEV_TENANT;
  else if (local) out["X-Tenant"] = local[1];
  return out;
}

/** Headers that tell the API which brand this request belongs to. */
export async function tenantHeaders(): Promise<Record<string, string>> {
  return hostHeaders(await getHost());
}

/** Brand for a host, kept for a minute. Used by pre-built pages, which know their host from the URL. */
export const tenantForHost = cache(async (host: string): Promise<Tenant | null> => {
  try {
    const res = await fetch(`${API_BASE}/tenant`, { headers: hostHeaders(host), next: { revalidate: 60 } });
    if (!res.ok) return null;
    const t = (await res.json()) as Tenant;
    return { ...t, theme: t.theme ?? {}, settings: t.settings ?? {}, campuses: t.campuses ?? [] };
  } catch {
    return null;
  }
});

/** Current brand, or null when the domain is unknown or the API is unreachable. Cached per request. */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  try {
    const res = await fetch(`${API_BASE}/tenant`, {
      headers: await tenantHeaders(),
      // Brand look and campuses change rarely: keep them for a minute instead of asking on every click.
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const t = (await res.json()) as Tenant;
    return { ...t, theme: t.theme ?? {}, settings: t.settings ?? {}, campuses: t.campuses ?? [] };
  } catch {
    return null;
  }
});

/**
 * Tenant for pages/layouts. When no brand resolves, the root layout already shows the
 * "site isn't set up" screen; nested segments still render in parallel, so bail out cleanly.
 */
export async function requireTenant(): Promise<Tenant> {
  const t = await getTenant();
  if (!t) notFound();
  return t;
}

/** Public origin of this brand site, e.g. https://event.sunstone.in */
export async function getOrigin(): Promise<string> {
  const host = await getHost();
  return `${/^(localhost|127\.|[a-z0-9-]+\.localhost)/.test(host) ? "http" : "https"}://${host}`;
}
