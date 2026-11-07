"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookmarkPlus, Check, Plus, Trash2, X } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Badge, Button, Input, Select, buttonClass } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { LibraryCriterion, Round } from "@/lib/types";

interface Row { id?: string; name: string; description?: string | null; maxScore: number; weight: number; roundId: string | null; _k: string }
const key = () => Math.random().toString(36).slice(2);

/**
 * Judging parameters: pick from the library (built-in + brand presets), add custom ones, scope each to every
 * check or one specific check, edit max score / weight, and save useful custom ones back to the brand library.
 */
export function CriteriaPicker({ eventId, initial, rounds, library }: {
  eventId: string;
  initial: { id?: string; name: string; description?: string | null; maxScore: number; weight: number; roundId?: string | null }[];
  rounds: Round[];
  library: LibraryCriterion[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initial.map((c) => ({ ...c, roundId: c.roundId ?? null, _k: c.id ?? key() })));
  const [scope, setScope] = useState<string>("");
  const [custom, setCustom] = useState({ name: "", description: "", maxScore: 10, weight: 1 });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const scopeId = scope || null;

  const change = (next: Row[]) => { setRows(next); setDirty(true); setMsg(null); };
  const update = (k: string, patch: Partial<Row>) => change(rows.map((r) => (r._k === k ? { ...r, ...patch } : r)));
  const has = (name: string) => rows.some((r) => r.roundId === scopeId && r.name.toLowerCase() === name.toLowerCase());
  const toggleLib = (c: LibraryCriterion) => {
    if (has(c.name)) change(rows.filter((r) => !(r.roundId === scopeId && r.name.toLowerCase() === c.name.toLowerCase())));
    else change([...rows, { name: c.name, description: c.description ?? null, maxScore: c.maxScore ?? 10, weight: c.weight ?? 1, roundId: scopeId, _k: key() }]);
  };

  const grouped = useMemo(() => {
    const m = new Map<string, LibraryCriterion[]>();
    for (const c of library) {
      const cat = c.category || (c.builtIn ? "Other" : "Your library");
      m.set(cat, [...(m.get(cat) ?? []), c]);
    }
    return [...m.entries()];
  }, [library]);

  const sections: { id: string | null; label: string }[] = [{ id: null, label: "All checks" }, ...rounds.map((r) => ({ id: r.id, label: r.name }))];
  const roundName = (id: string | null) => (id ? rounds.find((r) => r.id === id)?.name ?? "Check" : "All checks");

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const ordered = sections.flatMap((s) => rows.filter((r) => r.roundId === s.id));
      await callApi("PUT", `/events/${eventId}/rubric`, ordered.map((r, i) => ({
        ...(r.id ? { id: r.id } : {}), name: r.name.trim(), description: r.description || undefined,
        maxScore: r.maxScore, weight: r.weight, roundId: r.roundId, sortOrder: i,
      })));
      setDirty(false);
      setMsg({ ok: true, text: "Parameters saved" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  async function saveToLibrary(r: Row) {
    try {
      await callApi("POST", "/judging/library", { kind: "CRITERION", name: r.name.trim(), description: r.description || undefined, maxScore: r.maxScore, weight: r.weight, category: "Your library" });
      setSaved((s) => [...s, r._k]);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save to library" });
    }
  }

  async function removeFromLibrary(c: LibraryCriterion) {
    if (!c.id || !window.confirm(`Remove “${c.name}” from your brand library?`)) return;
    try { await callApi("DELETE", `/judging/library/${c.id}`); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  const totalWeight = (id: string | null) => rows.filter((r) => r.roundId === null || r.roundId === id).reduce((a, r) => a + (r.weight || 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {sections.map((s) => {
          const list = rows.filter((r) => r.roundId === s.id);
          if (s.id && !list.length) return null;
          return (
            <div key={s.id ?? "all"}>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {s.label}
                {s.id && <span className="font-normal normal-case">+ all-check parameters · total weight {totalWeight(s.id)}</span>}
              </p>
              {list.length ? (
                <div className="space-y-2">
                  <div className="hidden grid-cols-[1fr_70px_70px_140px_auto] gap-2 text-[11px] font-medium text-muted sm:grid"><span>Parameter</span><span>Max</span><span>Weight</span><span>Used in</span><span /></div>
                  {list.map((r) => (
                    <div key={r._k} className="grid items-start gap-2 sm:grid-cols-[1fr_70px_70px_140px_auto]">
                      <div className="space-y-1">
                        <Input value={r.name} onChange={(e) => update(r._k, { name: e.target.value })} aria-label="Parameter name" className="h-9" />
                        <Input value={r.description ?? ""} onChange={(e) => update(r._k, { description: e.target.value })} placeholder="What judges look for (optional)" aria-label="Description" className="h-8 text-xs" />
                      </div>
                      <Input type="number" min={1} value={r.maxScore} onChange={(e) => update(r._k, { maxScore: Number(e.target.value) })} aria-label="Max score" className="h-9" />
                      <Input type="number" min={0} step={0.5} value={r.weight} onChange={(e) => update(r._k, { weight: Number(e.target.value) })} aria-label="Weight" className="h-9" />
                      <Select value={r.roundId ?? ""} onChange={(e) => update(r._k, { roundId: e.target.value || null })} aria-label="Used in" className="h-9 text-xs">
                        <option value="">All checks</option>
                        {rounds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </Select>
                      <div className="flex">
                        {!library.some((l) => l.name.toLowerCase() === r.name.toLowerCase()) && r.name.trim() && (
                          <button type="button" title="Save to brand library" aria-label="Save to brand library" disabled={saved.includes(r._k)} className={buttonClass("ghost", "sm", "h-9 px-2")} onClick={() => saveToLibrary(r)}>
                            {saved.includes(r._k) ? <Check className="h-4 w-4 text-emerald-600" /> : <BookmarkPlus className="h-4 w-4" />}
                          </button>
                        )}
                        <button type="button" aria-label="Remove parameter" className={buttonClass("ghost", "sm", "h-9 px-2")} onClick={() => change(rows.filter((x) => x._k !== r._k))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">No parameters used in every check yet. Tick some from the library.</p>}
            </div>
          );
        })}

        <div className="rounded-lg border border-border bg-bg/50 p-3">
          <p className="mb-2 text-sm font-medium">Add a custom parameter to <span className="text-primary">{roundName(scopeId)}</span></p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_70px_70px_auto]">
            <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Name" aria-label="Custom parameter name" className="h-9" />
            <Input value={custom.description} onChange={(e) => setCustom({ ...custom, description: e.target.value })} placeholder="Description" aria-label="Custom parameter description" className="h-9" />
            <Input type="number" min={1} value={custom.maxScore} onChange={(e) => setCustom({ ...custom, maxScore: Number(e.target.value) })} aria-label="Max score" className="h-9" />
            <Input type="number" min={0} step={0.5} value={custom.weight} onChange={(e) => setCustom({ ...custom, weight: Number(e.target.value) })} aria-label="Weight" className="h-9" />
            <Button type="button" size="sm" className="h-9" disabled={!custom.name.trim()}
              onClick={() => { change([...rows, { ...custom, name: custom.name.trim(), roundId: scopeId, _k: key() }]); setCustom({ name: "", description: "", maxScore: 10, weight: 1 }); }}>
              <Plus className="h-4 w-4" />Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
          {dirty && !msg && <span className="text-xs text-muted">Unsaved changes</span>}
          <Button type="button" disabled={busy || rows.some((r) => !r.name.trim())} onClick={save}>{busy ? "Saving…" : "Save parameters"}</Button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Parameter library</p>
          <p className="text-xs text-muted">Tick to add to:</p>
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1 h-9 text-sm" aria-label="Add parameters to">
            <option value="">All checks</option>
            {rounds.map((r) => <option key={r.id} value={r.id}>Only “{r.name}”</option>)}
          </Select>
        </div>
        <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
              <ul className="space-y-1">
                {items.map((c) => {
                  const on = has(c.name);
                  return (
                    <li key={(c.id ?? "") + c.name} className="group flex items-start gap-1">
                      <label className={cn("flex flex-1 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg", on && "bg-primary/5")}>
                        <input type="checkbox" checked={on} onChange={() => toggleLib(c)} className="mt-0.5 accent-[rgb(var(--primary))]" />
                        <span className="min-w-0">
                          <span className="font-medium">{c.name}</span>
                          {!c.builtIn && <Badge tone="purple" className="ml-1 px-1.5 py-0 text-[10px]">Brand</Badge>}
                          {c.description && <span className="block text-xs text-muted">{c.description}</span>}
                        </span>
                      </label>
                      {!c.builtIn && c.id && (
                        <button type="button" aria-label={`Remove ${c.name} from library`} className={buttonClass("ghost", "sm", "h-7 px-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100")} onClick={() => removeFromLibrary(c)}><X className="h-3.5 w-3.5" /></button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
