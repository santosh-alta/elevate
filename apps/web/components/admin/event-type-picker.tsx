"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { DEFAULT_MODULES, EVENT_TYPE_LABELS, familyOf, type EventFamily, type EventModules, type EventType } from "@elevate/shared";
import { EventIcon } from "@/components/event-icon";
import { Badge } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { EventCategory, EventTypesFamily } from "@/lib/types";

export const MODULE_LABELS: Record<keyof EventModules, string> = {
  teams: "teams", judging: "judging", submissions: "submissions", guests: "guests & speakers", checkin: "QR check-in",
  certificates: "certificates", feedback: "feedback", budget: "budget", sponsors: "sponsors",
};
/** Modules every type has; listed last so the type-specific ones stand out. */
const COMMON: (keyof EventModules)[] = ["checkin", "certificates", "feedback"];

/** Base type defaults with the brand type's overrides on top. */
export function effectiveModules(type: EventType, category?: Pick<EventCategory, "modules"> | null): EventModules {
  return { ...DEFAULT_MODULES[type], ...((category?.modules ?? {}) as Partial<EventModules>) };
}

/** "teams, judging, submissions, QR check-in …" */
export function modulesSummary(m: EventModules): string {
  const on = (Object.keys(MODULE_LABELS) as (keyof EventModules)[]).filter((k) => m[k]);
  const ordered = [...on.filter((k) => !COMMON.includes(k)), ...on.filter((k) => COMMON.includes(k))];
  return ordered.map((k) => MODULE_LABELS[k]).join(", ") || "nothing extra";
}

export interface TypeChoice { type: EventType; category: EventCategory | null }

const radioCard = "relative flex cursor-pointer gap-3 rounded-brand border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:hover:border-border";

/**
 * Two-step event type picker: family → type. Brand types (categories) show alongside the built-in
 * types of their family. With `lockedType` (editing), only choices with that base type can be picked.
 */
export function EventTypePicker({
  families, value, onChange, lockedType,
}: {
  families: EventTypesFamily[]; value: TypeChoice; onChange: (c: TypeChoice) => void; lockedType?: EventType;
}) {
  const [family, setFamily] = useState<EventFamily>(value.category?.family ?? familyOf(value.type));
  const fam = families.find((f) => f.key === family) ?? families[0];
  const lockedFamily = lockedType ? familyOf(lockedType) : undefined;
  const customs = (fam?.custom ?? []).filter((c) => (!c.archived && !c.archivedAt) || c.id === value.category?.id);
  const selectedKey = value.category ? `c:${value.category.id}` : `t:${value.type}`;
  const mods = effectiveModules(value.type, value.category);

  function pickFamily(f: EventTypesFamily) {
    setFamily(f.key);
    if (lockedType) return;
    if (familyOf(value.type) !== f.key) onChange({ type: f.types[0]?.type ?? "OTHER", category: null });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-fg"><span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-fg">1</span>What kind of event is it?</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {families.map((f) => (
            <label key={f.key} className={cn(radioCard, "items-start sm:flex-col sm:gap-2")}>
              <input type="radio" name="__family" value={f.key} checked={family === f.key} disabled={!!lockedFamily && lockedFamily !== f.key}
                onChange={() => pickFamily(f)} className="sr-only" />
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><EventIcon name={f.icon} className="h-5 w-5" /></span>
              {family === f.key && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" aria-hidden />}
              <span className="min-w-0 pr-5 sm:pr-0">
                <span className="block font-heading text-sm font-semibold leading-tight text-fg">{f.label}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-snug text-muted sm:line-clamp-none">{f.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {fam && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg"><span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-fg">2</span>Which {fam.label.toLowerCase()} type?</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customs.map((c) => (
              <label key={c.id} className={radioCard}>
                <input type="radio" name="__type" value={`c:${c.id}`} checked={selectedKey === `c:${c.id}`} disabled={!!lockedType && c.baseType !== lockedType}
                  onChange={() => onChange({ type: c.baseType, category: c })} className="sr-only" />
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-fg"><EventIcon name={c.icon} fallback={fam.icon} className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="text-sm font-semibold text-fg">{c.name}</span><Badge tone="highlight">Your brand</Badge></span>
                  <span className="mt-0.5 block text-xs text-muted">Works like {EVENT_TYPE_LABELS[c.baseType]}{c.description ? ` · ${c.description}` : ""}</span>
                </span>
              </label>
            ))}
            {fam.types.map((t) => (
              <label key={t.type} className={radioCard}>
                <input type="radio" name="__type" value={`t:${t.type}`} checked={selectedKey === `t:${t.type}`} disabled={!!lockedType && t.type !== lockedType}
                  onChange={() => onChange({ type: t.type, category: null })} className="sr-only" />
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-muted ring-1 ring-inset ring-border"><EventIcon name={fam.icon} className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{t.label ?? EVENT_TYPE_LABELS[t.type]}</span>
                  {t.hint && <span className="mt-0.5 block text-xs text-muted">{t.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className="rounded-brand border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-fg" aria-live="polite">
        <span className="font-semibold">{value.category?.name ?? EVENT_TYPE_LABELS[value.type]}</span>
        {value.category && <span className="text-muted"> (works like {EVENT_TYPE_LABELS[value.type]})</span>}
        {" · "}Turns on: {modulesSummary(mods)}.
        {lockedType && <span className="block text-xs text-muted">The base type can&apos;t change after creation. Duplicate the event instead.</span>}
      </p>
    </div>
  );
}
