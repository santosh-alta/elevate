"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Input } from "@/components/ui";
import type { Criterion } from "@/lib/types";

const PRESET: Criterion[] = [
  { name: "Innovation", maxScore: 10, weight: 1.5 },
  { name: "Technical execution", maxScore: 10, weight: 1.5 },
  { name: "Impact & usefulness", maxScore: 10, weight: 1 },
  { name: "Presentation", maxScore: 10, weight: 1 },
];

export function RubricEditor({ eventId, initial }: { eventId: string; initial: Criterion[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Criterion[]>(initial.length ? initial : PRESET);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (i: number, patch: Partial<Criterion>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {!initial.length && <p className="text-xs text-muted">Suggested rubric — edit and save.</p>}
      <div className="grid grid-cols-[1fr_80px_80px_auto] gap-2 text-xs font-medium text-muted"><span>Criterion</span><span>Max</span><span>Weight</span><span /></div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] gap-2">
          <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Input type="number" min={1} value={r.maxScore} onChange={(e) => update(i, { maxScore: Number(e.target.value) })} />
          <Input type="number" min={0} step={0.5} value={r.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { name: "", maxScore: 10, weight: 1 }])}><Plus className="h-4 w-4" />Add criterion</Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || rows.some((r) => !r.name.trim())}
          onClick={async () => {
            setBusy(true); setMsg(null);
            try {
              await callApi("PUT", `/events/${eventId}/rubric`, rows.map(({ name, description, maxScore, weight }) => ({ name, description: description ?? undefined, maxScore, weight })));
              setMsg("Rubric saved."); router.refresh();
            } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
          }}
        >
          Save rubric
        </Button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}
