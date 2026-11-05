import { humanize } from "@/lib/format";
import { Stat } from "./ui/stat";

/** Collects numeric leaves of an API payload ({ registrations: 10, judging: { scored: 3 } }) as labelled stats. */
export function numericLeaves(obj: unknown, skip: string[] = [], prefix = ""): { label: string; value: number }[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const out: { label: string; value: number }[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (skip.includes(k)) continue;
    const label = prefix ? `${prefix} · ${humanize(k)}` : humanize(k);
    if (typeof v === "number") out.push({ label, value: v });
    else if (v && typeof v === "object" && !Array.isArray(v)) out.push(...numericLeaves(v, skip, label));
  }
  return out;
}

export function StatGrid({ data, skip, limit = 12 }: { data: unknown; skip?: string[]; limit?: number }) {
  const items = numericLeaves(data, skip).slice(0, limit);
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((i) => <Stat key={i.label} label={i.label} value={Number.isInteger(i.value) ? i.value : i.value.toFixed(1)} />)}
    </div>
  );
}

/** Readable rendering of an arbitrary JSON report. */
export function KeyValue({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return <span className="text-muted">—</span>;
  if (typeof data !== "object") {
    const s = String(data);
    if (/^https?:\/\//.test(s)) return <a href={s} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{s}</a>;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return <span>{new Date(s).toLocaleString("en-IN")}</span>;
    return <span>{s}</span>;
  }
  if (Array.isArray(data)) {
    if (!data.length) return <span className="text-muted">None</span>;
    if (data.every((d) => typeof d !== "object")) return <span>{data.join(", ")}</span>;
    return (
      <ul className="space-y-2">
        {data.slice(0, 50).map((d, i) => (
          <li key={i} className="rounded-lg border border-border p-3"><KeyValue data={d} depth={depth + 1} /></li>
        ))}
      </ul>
    );
  }
  return (
    <dl className={depth === 0 ? "divide-y divide-border" : "space-y-1"}>
      {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
        <div key={k} className={depth === 0 ? "grid gap-2 py-3 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-3"}>
          <dt className="text-sm font-medium text-muted">{humanize(k)}</dt>
          <dd className="text-sm sm:col-span-2"><KeyValue data={v} depth={depth + 1} /></dd>
        </div>
      ))}
    </dl>
  );
}
