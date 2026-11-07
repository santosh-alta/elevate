"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

export const MAX_TAGS = 15;

/** Merge tag lists case-insensitively, first spelling wins, capped at MAX_TAGS. */
export function mergeTags(...lists: (readonly string[] | undefined | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, MAX_TAGS);
}

/**
 * Chip input for event tags: Enter or comma adds, Backspace on an empty box removes the last chip,
 * suggestion buttons add with one click. Optionally mirrors the value into a hidden input `name`.
 */
export function TagsInput({
  value, onChange, suggestions = [], label = "Tags", hint, name, max = MAX_TAGS,
}: {
  value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; label?: string; hint?: string; name?: string; max?: number;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const full = value.length >= max;
  const lower = new Set(value.map((t) => t.toLowerCase()));
  const q = text.trim().toLowerCase();
  const shown = useMemo(
    () => mergeTags(suggestions).filter((s) => !lower.has(s.toLowerCase()) && (!q || s.toLowerCase().includes(q))).slice(0, q ? 8 : 14),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggestions, value, q],
  );

  function add(t: string) {
    const next = mergeTags(value, [t]);
    onChange(next.slice(0, max));
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && text.trim()) { e.preventDefault(); if (!full) add(text); }
    else if (e.key === "Enter") e.preventDefault();
    else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
        <span className="text-xs tabular-nums text-muted" aria-live="polite">{value.length}/{max}</span>
      </div>
      {name && <input type="hidden" name={name} value={JSON.stringify(value)} />}
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-brand border border-border bg-card px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        <ul className="contents" aria-label="Selected tags">
          {value.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}
                className="rounded-full p-0.5 hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          value={text}
          disabled={full}
          onChange={(e) => setText(e.target.value.replace(",", ""))}
          onKeyDown={onKey}
          onBlur={() => { if (text.trim() && !full) add(text); }}
          maxLength={40}
          placeholder={full ? "Tag limit reached" : value.length ? "Add another…" : "Type a tag and press Enter"}
          className="h-7 min-w-[10rem] flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-muted/70 focus:outline-none disabled:cursor-not-allowed"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {shown.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{q ? "Matches:" : "Suggestions:"}</span>
          {shown.map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-fg hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent")}>
              <Plus className="h-3 w-3" aria-hidden /><span className="sr-only">Add tag </span>{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
