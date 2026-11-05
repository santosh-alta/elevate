"use client";

/** Browser → Next proxy (/api/proxy/...) → Elevate API. The proxy adds tenant + auth headers. */
export async function callApi<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string } | null)?.message ?? (data as { error?: string } | null)?.error;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data as T;
}

/**
 * Turns FormData into JSON. Name suffixes control types:
 *   name:number  name:bool (checkbox)  name:date (datetime-local → ISO)  name:array (multi-value)  name:json
 * Empty values are omitted unless the field has data-keep-empty.
 */
export function formToJson(form: HTMLFormElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fd = new FormData(form);
  const seen = new Set<string>();
  // Unchecked checkboxes don't appear in FormData: default every :bool field to false.
  form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((el) => {
    if (el.name.endsWith(":bool")) setPath(out, el.name.slice(0, -5), false);
  });
  for (const [rawName] of fd.entries()) {
    if (seen.has(rawName)) continue;
    seen.add(rawName);
    const [name, kind] = rawName.split(":");
    const values = fd.getAll(rawName).map((v) => (typeof v === "string" ? v : "")).filter((v) => v !== "");
    if (kind === "array") { setPath(out, name, values); continue; }
    const v = values[0];
    if (v === undefined) continue;
    if (kind === "number") setPath(out, name, Number(v));
    else if (kind === "bool") setPath(out, name, v === "on" || v === "true");
    else if (kind === "date") setPath(out, name, new Date(v).toISOString());
    else if (kind === "json") { try { setPath(out, name, JSON.parse(v)); } catch { setPath(out, name, v); } }
    else setPath(out, name, v);
  }
  return out;
}

/** Supports dotted names: "modules.teams" → { modules: { teams } } */
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = (cur[parts[i]] as Record<string, unknown>) ?? {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
