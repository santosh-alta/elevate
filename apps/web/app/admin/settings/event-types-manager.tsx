"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { DEFAULT_MODULES, EVENT_TYPE_LABELS, type EventFamily, type EventModules, type EventType } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { CATEGORY_ICON_CHOICES, EventIcon } from "@/components/event-icon";
import { MODULE_LABELS, effectiveModules, modulesSummary } from "@/components/admin/event-type-picker";
import { TagsInput } from "@/components/admin/tags-input";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { EventCategory, EventTypesFamily } from "@/lib/types";

const isArchived = (c: EventCategory) => !!(c.archived || c.archivedAt);

/** Settings → Event types: the brand's own types (CRUD) next to the read-only built-in families. */
export function EventTypesManager({ families, canEdit, tagSuggestions }: { families: EventTypesFamily[]; canEdit: boolean; tagSuggestions: string[] }) {
  const router = useRouter();
  const custom = families.flatMap((f) => f.custom.map((c) => ({ ...c, family: c.family ?? f.key })));
  const [editing, setEditing] = useState<EventCategory | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [rowMsg, setRowMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(c: EventCategory, method: "PATCH" | "DELETE", body?: unknown, okText?: string) {
    if (method === "DELETE" && !window.confirm(`Delete “${c.name}”? This can't be undone.`)) return;
    setBusyId(c.id); setRowMsg(null);
    try {
      await callApi(method, `/event-categories/${c.id}`, body);
      if (okText) setRowMsg({ id: c.id, ok: true, text: okText });
      if (editing?.id === c.id) { setEditing(null); setFormKey((k) => k + 1); }
      router.refresh();
    } catch (e) {
      setRowMsg({ id: c.id, ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
      <Card>
        <CardHeader
          title="Your event types"
          description="Your own names for recurring formats, e.g. “Founder Friday”. Each works like a built-in type, with its own modules and default tags."
          action={canEdit && editing ? <Button size="sm" variant="outline" onClick={() => { setEditing(null); setFormKey((k) => k + 1); }}><Plus className="h-4 w-4" />New</Button> : undefined}
        />
        {custom.length ? (
          <ul className="divide-y divide-border">
            {custom.map((c) => {
              const fam = families.find((f) => f.key === c.family);
              return (
                <li key={c.id} className={cn("flex flex-wrap items-start gap-3 px-5 py-4", editing?.id === c.id && "bg-primary/5")}>
                  <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full", isArchived(c) ? "bg-bg text-muted ring-1 ring-inset ring-border" : "bg-highlight text-highlight-fg")}>
                    <EventIcon name={c.icon} fallback={fam?.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      {isArchived(c) && <Badge tone="gray">Archived</Badge>}
                    </p>
                    <p className="text-xs text-muted">{fam?.label ?? c.family} · works like {EVENT_TYPE_LABELS[c.baseType]}{typeof c.eventCount === "number" ? ` · ${c.eventCount} ${c.eventCount === 1 ? "event" : "events"}` : ""}</p>
                    {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                    <p className="mt-1 text-xs text-muted">Turns on: {modulesSummary(effectiveModules(c.baseType, c))}</p>
                    {!!c.defaultTags?.length && (
                      <p className="mt-1.5 flex flex-wrap gap-1">{c.defaultTags.map((t) => <span key={t} className="rounded-full bg-primary/5 px-2 py-0.5 text-xs text-primary ring-1 ring-inset ring-primary/15">#{t}</span>)}</p>
                    )}
                    {rowMsg?.id === c.id && <p role="status" className={cn("mt-1 text-xs", rowMsg.ok ? "text-emerald-700" : "text-red-600")}>{rowMsg.text}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setFormKey((k) => k + 1); }} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" />Edit</Button>
                      {isArchived(c)
                        ? <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => act(c, "PATCH", { archived: false }, "Restored")} aria-label={`Unarchive ${c.name}`}><ArchiveRestore className="h-4 w-4" />Unarchive</Button>
                        : <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => act(c, "PATCH", { archived: true }, "Archived: hidden from the type picker")} aria-label={`Archive ${c.name}`}><Archive className="h-4 w-4" />Archive</Button>}
                      <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" disabled={busyId === c.id} onClick={() => act(c, "DELETE")} aria-label={`Delete ${c.name}`}><Trash2 className="h-4 w-4" />Delete</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5"><EmptyState title="No brand types yet" description="Create one for formats you run again and again, like a monthly speaker series." /></div>
        )}
      </Card>

      {canEdit && (
        <div className="space-y-3">
        {notice && <p role="status" className="rounded-brand bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">{notice}</p>}
        <CategoryEditor
          key={formKey}
          families={families}
          category={editing}
          tagSuggestions={tagSuggestions}
          onDone={(text) => { setNotice(text); setEditing(null); setFormKey((k) => k + 1); router.refresh(); }}
          onCancel={() => { setEditing(null); setFormKey((k) => k + 1); }}
        />
        </div>
      )}
    </div>
  );
}

const MODULE_KEYS = Object.keys(MODULE_LABELS) as (keyof EventModules)[];

function CategoryEditor({
  families, category, tagSuggestions, onDone, onCancel,
}: {
  families: EventTypesFamily[]; category: EventCategory | null; tagSuggestions: string[]; onDone: (message: string) => void; onCancel: () => void;
}) {
  const [family, setFamily] = useState<EventFamily>(category?.family ?? families[0].key);
  const famTypes = families.find((f) => f.key === family)?.types ?? [];
  const [baseType, setBaseType] = useState<EventType>(category?.baseType ?? famTypes[0]?.type ?? "OTHER");
  const [icon, setIcon] = useState<string>(category?.icon ?? "");
  const [modules, setModules] = useState<EventModules>(effectiveModules(category?.baseType ?? baseType, category));
  const [tags, setTags] = useState<string[]>(category?.defaultTags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeBase(t: EventType) {
    // Keep the admin's overrides relative to the old base; re-apply them on the new base.
    const overrides = Object.fromEntries(MODULE_KEYS.filter((k) => modules[k] !== DEFAULT_MODULES[baseType][k]).map((k) => [k, modules[k]]));
    setBaseType(t);
    setModules({ ...DEFAULT_MODULES[t], ...overrides });
  }

  return (
    <Card className="h-fit">
      <CardHeader title={category ? `Edit “${category.name}”` : "New event type"} description={category ? "Changes apply to new events. Existing events keep their modules." : "It shows up in the event type picker under its family, marked “Your brand”."} />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "").trim();
            if (name.length < 2) { setError("Give the type a name."); return; }
            const overrides = Object.fromEntries(MODULE_KEYS.filter((k) => modules[k] !== DEFAULT_MODULES[baseType][k]).map((k) => [k, modules[k]]));
            const body = {
              name, family, baseType,
              description: String(fd.get("description") ?? "").trim() || (category?.description ? null : undefined),
              icon: icon || (category?.icon ? null : undefined),
              modules: overrides,
              defaultTags: tags,
            };
            setBusy(true); setError(null);
            try {
              await callApi(category ? "PATCH" : "POST", category ? `/event-categories/${category.id}` : "/event-categories", body);
              onDone(category ? `Saved “${name}”` : `Created “${name}”. It now shows in the event type picker.`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name"><Input name="name" required minLength={2} maxLength={60} defaultValue={category?.name ?? ""} placeholder="e.g. Founder Friday" /></Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Family">
              <Select value={family} onChange={(e) => {
                const f = e.target.value as EventFamily;
                setFamily(f);
                const first = families.find((x) => x.key === f)?.types[0]?.type;
                if (first) changeBase(first);
              }}>
                {families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </Select>
            </Field>
            <Field label="Works like" hint="Sets the checklist, page template and certificates">
              <Select value={baseType} onChange={(e) => changeBase(e.target.value as EventType)}>
                {famTypes.map((t) => <option key={t.type} value={t.type}>{t.label ?? EVENT_TYPE_LABELS[t.type]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description" hint="Optional. Shown under the name in the type picker."><Textarea name="description" rows={2} className="min-h-[64px]" defaultValue={category?.description ?? ""} placeholder="A founder shares their story every Friday" /></Field>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Icon</legend>
            <div className="grid grid-cols-8 gap-1.5">
              {CATEGORY_ICON_CHOICES.map((n) => (
                <label key={n} title={n} className="flex aspect-square cursor-pointer items-center justify-center rounded-brand border border-border text-muted hover:border-primary/50 hover:text-primary has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent">
                  <input type="radio" name="__icon" value={n} checked={icon === n} onChange={() => setIcon(n)} className="sr-only" aria-label={n} />
                  <EventIcon name={n} className="h-4 w-4" />
                </label>
              ))}
            </div>
            {icon && <button type="button" onClick={() => setIcon("")} className="mt-1 text-xs text-muted underline hover:text-fg">Use the family icon</button>}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Modules</legend>
            <p className="mb-1.5 text-xs text-muted">Starts from {EVENT_TYPE_LABELS[baseType]}&apos;s defaults. Changes are marked.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MODULE_KEYS.map((k) => {
                const changed = modules[k] !== DEFAULT_MODULES[baseType][k];
                return (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="checkbox" checked={modules[k]} onChange={(e) => setModules({ ...modules, [k]: e.target.checked })} className="accent-[rgb(var(--primary))]" />
                    <span className="first-letter:uppercase">{MODULE_LABELS[k]}</span>
                    {changed && <span className="ml-auto text-[10px] font-semibold uppercase text-primary" title="Differs from the base type">changed</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <TagsInput label="Default tags" value={tags} onChange={setTags} suggestions={tagSuggestions} hint="Added to every new event of this type (editable per event)." />

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : category ? "Save changes" : "Create type"}</Button>
            {category && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
