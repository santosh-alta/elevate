"use client";

import { useEffect, useState } from "react";
import { BellRing, Mail, Users } from "lucide-react";
import { callApi } from "@/components/client/api";
import { cn } from "@/components/ui/cn";

type Summary = { connected: boolean; total: number; batches: { batch: number; students: number }[]; programs: { program: string; students: number }[] };

/**
 * Who the event is for (batches and programs, on top of the campus choice above) and which emails go out:
 * "new event, register now" to that audience when it's announced, and reminders to registered people.
 */
export function AudiencePicker({
  campusIds, batches, programs, notify, reminders, onChange, announced,
}: {
  /** null = all campuses */
  campusIds: string[] | null;
  batches: number[]; programs: string[]; notify: boolean; reminders: boolean;
  onChange: (p: { batches?: number[]; programs?: string[]; notify?: boolean; reminders?: boolean }) => void;
  /** The "new event" email already went out */
  announced?: boolean;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => { callApi<Summary>("GET", "/students/summary").then(setSummary).catch(() => setSummary(null)); }, []);
  useEffect(() => {
    const qs = new URLSearchParams();
    if (campusIds) qs.set("campusIds", campusIds.join(","));
    if (batches.length) qs.set("batches", batches.join(","));
    if (programs.length) qs.set("programs", programs.join(","));
    const t = setTimeout(() => {
      callApi<{ count: number }>("GET", `/students/audience?${qs}`).then((r) => setCount(r.count)).catch(() => setCount(null));
    }, 250);
    return () => clearTimeout(t);
  }, [campusIds?.join(","), batches.join(","), programs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chip = (on: boolean) => cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
    on ? "border-primary bg-primary text-primary-fg" : "border-border bg-card hover:border-primary/50",
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">Batches (year of joining)</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(!batches.length)} onClick={() => onChange({ batches: [] })}>All batches</button>
          {(summary?.batches ?? []).map((b) => (
            <button key={b.batch} type="button" className={chip(batches.includes(b.batch))} onClick={() => onChange({ batches: toggle(batches, b.batch) })}>
              {b.batch} <span className="opacity-70">· {b.students}</span>
            </button>
          ))}
        </div>
      </div>
      {(summary?.programs.length ?? 0) > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium">Programs</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(!programs.length)} onClick={() => onChange({ programs: [] })}>All programs</button>
            {summary!.programs.map((p) => (
              <button key={p.program} type="button" className={chip(programs.includes(p.program))} onClick={() => onChange({ programs: toggle(programs, p.program) })}>
                {p.program} <span className="opacity-70">· {p.students}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
        <Users className="h-4 w-4 text-primary" />
        {count == null ? "Counting…" : <span><strong>{count.toLocaleString("en-IN")}</strong> students in this audience{campusIds ? "" : " (all campuses)"}</span>}
      </p>
      {summary && !summary.total && (
        <p className="text-xs text-muted">The student list hasn&rsquo;t been imported yet. Until then, emails go only to students who have signed up on this site.</p>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={notify} disabled={announced} onChange={(e) => onChange({ notify: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
          <span>
            <span className="flex items-center gap-1.5 font-medium"><Mail className="h-4 w-4" />Email this audience when the event is announced</span>
            <span className="block text-xs text-muted">{announced ? "Already sent." : "A “New event, register now” email goes out once, a few minutes after the event goes public."}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={reminders} onChange={(e) => onChange({ reminders: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
          <span>
            <span className="flex items-center gap-1.5 font-medium"><BellRing className="h-4 w-4" />Send reminders to registered students</span>
            <span className="block text-xs text-muted">At the times set in Settings → Notifications (default 24 hours and 1 hour before).</span>
          </span>
        </label>
      </div>
    </div>
  );
}
