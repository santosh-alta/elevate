import { cookies } from "next/headers";
import { API_BASE, TOKEN_COOKIE } from "./config";
import { tenantHeaders } from "./tenant";

export interface ApiResult<T> { ok: boolean; status: number; data: T | null; error?: string }

/** Server-side call to the Elevate API with brand + auth headers. Never throws. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const token = (await cookies()).get(TOKEN_COOKIE)?.value;
    const headers: Record<string, string> = { ...(await tenantHeaders()) };
    if (init.body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data as { message?: string } | null)?.message ?? res.statusText;
      return { ok: false, status: res.status, data: null, error: msg };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** GET helper returning null on any failure. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const r = await apiFetch<T>(path);
  return r.ok ? r.data : null;
}

/** GET helper for list endpoints; tolerates `{ items: [] }` or `{ data: [] }` wrappers. */
export async function apiList<T>(path: string): Promise<T[]> {
  const d = await apiGet<unknown>(path);
  if (Array.isArray(d)) return d as T[];
  if (d && typeof d === "object") {
    for (const k of ["items", "data", "results"]) {
      const v = (d as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

/**
 * Public data (no sign-in), kept ready for a short time so pages load instantly for most visitors.
 * Never sends the visitor's token, so it is safe to share between visitors of the same brand.
 */
export async function apiPublic<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: await tenantHeaders(),
      next: { revalidate },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** List version of apiPublic; tolerates `{ items: [] }` wrappers. */
export async function apiListPublic<T>(path: string, revalidate = 30): Promise<T[]> {
  const d = await apiPublic<unknown>(path, revalidate);
  if (Array.isArray(d)) return d as T[];
  if (d && typeof d === "object") {
    for (const k of ["items", "data", "results"]) {
      const v = (d as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
