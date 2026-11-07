"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EVENT_MODES, SUGGESTED_TAGS, type EventModules } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { Button, Card, CardBody, CardHeader, Field, FieldGroup, Input, Select, Textarea } from "@/components/ui";
import { humanize, paiseToRupees, rupeesToPaise, toLocalInput } from "@/lib/format";
import { UploadField } from "@/components/client/uploader";
import { RichTextEditor } from "@/components/client/rich-text-editor";
import { EventTypePicker, effectiveModules, type TypeChoice } from "@/components/admin/event-type-picker";
import { MAX_TAGS, TagsInput, mergeTags } from "@/components/admin/tags-input";
import { builtInFamilies } from "@/lib/families";
import type { Campus, ElevateEvent, EventCategory, EventTypesFamily, Track } from "@/lib/types";

/** Keep track ids stable across edits (problem statements and teams point at them). */
function tracksFromLines(text: string, prev: Track[]): Track[] {
  const used = new Set<string>();
  let n = prev.length;
  return text.split("\n").map((t) => t.trim()).filter(Boolean).map((line) => {
    const [name, ...rest] = line.split(" - ");
    const existing = prev.find((t) => t.name.toLowerCase() === name.trim().toLowerCase() && !used.has(t.id));
    let id = existing?.id;
    while (!id || used.has(id) || (!existing && prev.some((t) => t.id === id))) id = `t${++n}`;
    used.add(id);
    const description = rest.join(" - ").trim() || existing?.description;
    return { id, name: name.trim(), ...(description ? { description } : {}) };
  });
}

const MODULE_HELP: Record<keyof EventModules, string> = {
  teams: "Participants form teams",
  judging: "Judges score teams on a rubric",
  submissions: "Teams submit project links",
  guests: "Track speakers & chief guests",
  checkin: "QR code attendance",
  certificates: "Auto-generate certificates",
  feedback: "Post-event feedback form",
  budget: "Plan budget and track expenses",
  sponsors: "Show sponsors & partners on the page",
};

export function EventForm({
  campuses, event, parents = [], families: familiesProp, tagSuggestions = [],
}: {
  campuses: Campus[]; event?: ElevateEvent; parents?: { id: string; title: string }[];
  /** GET /event-types (families with built-in + brand types). Falls back to the shared families. */
  families?: EventTypesFamily[];
  /** Tags already used by this brand (GET /tags), most used first. */
  tagSuggestions?: string[];
}) {
  const router = useRouter();
  const families = familiesProp?.length ? familiesProp : builtInFamilies();
  const allCategories: EventCategory[] = families.flatMap((f) => f.custom ?? []);
  const initialCategory: EventCategory | null = event?.category
    ? allCategories.find((c) => c.id === event.category!.id) ?? { id: event.category.id, name: event.category.name, icon: event.category.icon, baseType: event.type, family: event.family ?? families.find((f) => f.types.some((t) => t.type === event.type))?.key ?? "FESTS" }
    : null;
  const [choice, setChoice] = useState<TypeChoice>({ type: event?.type ?? "HACKATHON", category: initialCategory });
  const type = choice.type;
  const [tags, setTags] = useState<string[]>(event?.tags ?? []);
  const [scope, setScope] = useState(event?.scope ?? "CENTRAL");
  const [mode, setMode] = useState(event?.mode ?? "OFFLINE");
  const [modules, setModules] = useState<EventModules>({ ...effectiveModules(event?.type ?? "HACKATHON", event ? null : initialCategory), ...(event?.modules ?? {}) });
  const initialCampuses = (event?.campuses ?? []).map((c) => ("campus" in c ? c.campus.id : c.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(!!event?.feeAmount);
  const isHack = modules.teams;
  const parentOptions = parents.filter((p) => p.id !== event?.id);
  if (event?.parentEventId && !parentOptions.some((p) => p.id === event.parentEventId)) {
    parentOptions.unshift({ id: event.parentEventId, title: event.parentEvent?.title ?? "Current parent event" });
  }

  function chooseType(next: TypeChoice) {
    const prevCat = choice.category;
    setChoice(next);
    if (!event) setModules(effectiveModules(next.type, next.category));
    else if (next.category?.modules) setModules({ ...modules, ...(next.category.modules as Partial<EventModules>) });
    if (next.category?.defaultTags?.length && next.category.id !== prevCat?.id) setTags((t) => mergeTags(t, next.category!.defaultTags));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => (fd.get(k) as string | null)?.trim() || undefined;
        const d = (k: string) => (s(k) ? new Date(s(k)!).toISOString() : undefined);
        const body: Record<string, unknown> = {
          title: s("title"), tagline: s("tagline"), description: s("description") ?? (event?.description ? "" : undefined), scope, mode,
          // The base type is fixed after creation (PATCH doesn't take `type`).
          ...(event ? {} : { type }),
          // Brand type: send its id; clearing a previous one sends null.
          categoryId: choice.category?.id ?? (event?.category || event?.categoryId ? null : undefined),
          tags: mergeTags(tags),
          campusIds: scope === "CAMPUS" ? fd.getAll("campusIds") : [],
          venue: s("venue"), meetingUrl: s("meetingUrl"), coverImageUrl: s("coverImageUrl"),
          startsAt: d("startsAt"), endsAt: d("endsAt"),
          registrationOpensAt: d("registrationOpensAt"), registrationClosesAt: d("registrationClosesAt"),
          capacity: s("capacity") ? Number(s("capacity")) : undefined,
          requiresApproval: fd.get("requiresApproval") === "on",
          modules,
        };
        // Clearing optional values: only send null when there was a value before (create never needs it).
        const clear = (k: keyof ElevateEvent) => (event && event[k] != null ? null : undefined);
        body.parentEventId = s("parentEventId") ?? clear("parentEventId");
        // Pricing: admins type rupees, the API stores paise.
        if (paid) {
          const fee = rupeesToPaise(s("feeRupees"));
          if (!fee) { setError("Enter the registration fee, or switch the event to Free."); return; }
          body.feeAmount = fee;
          body.currency = "INR";
          body.feeType = s("feeType") ?? "PER_PERSON";
          const early = rupeesToPaise(s("earlyBirdRupees"));
          if (early !== undefined && !d("earlyBirdEndsAt")) { setError("Set when the early-bird price ends."); return; }
          if (early !== undefined && early >= fee) { setError("The early-bird price should be lower than the regular fee."); return; }
          body.earlyBirdAmount = early ?? clear("earlyBirdAmount");
          body.earlyBirdEndsAt = early !== undefined ? d("earlyBirdEndsAt") : clear("earlyBirdEndsAt");
        } else {
          body.feeAmount = 0;
        }
        if (modules.submissions) {
          body.submissionsOpenAt = d("submissionsOpenAt") ?? clear("submissionsOpenAt");
          body.submissionsCloseAt = d("submissionsCloseAt") ?? clear("submissionsCloseAt");
        }
        if (isHack) {
          const tracks = tracksFromLines(s("tracks") ?? "", event?.config?.tracks ?? []);
          const min = s("minTeamSize") ? Number(s("minTeamSize")) : undefined;
          const max = s("maxTeamSize") ? Number(s("maxTeamSize")) : undefined;
          if (min && max && min > max) { setError("Min team size can't be larger than max team size."); return; }
          body.config = {
            ...(event?.config ?? {}),
            minTeamSize: min,
            maxTeamSize: max,
            teamRegistration: s("teamRegistration") ?? "LEADER_ADDS",
            tracks,
          };
        }
        setBusy(true); setError(null);
        try {
          const res = await callApi<{ id: string }>(event ? "PATCH" : "POST", event ? `/events/${event.id}` : "/events", body);
          if (event) router.refresh();
          else router.push(`/admin/events/${res.id}`);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Card>
        <CardHeader title="Event type" description="Pick the kind of event first. It sets up the checklist, page template, certificates and modules." />
        <CardBody>
          <EventTypePicker families={families} value={choice} onChange={chooseType} lockedType={event?.type} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Basics" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2"><Input name="title" required minLength={3} defaultValue={event?.title} placeholder="e.g. Build for Bharat Hackathon 2026" /></Field>
          <Field label="Tagline" className="sm:col-span-2"><Input name="tagline" defaultValue={event?.tagline ?? ""} placeholder="One line that sells it" /></Field>
          <FieldGroup label="Cover image" className="sm:col-span-2" hint="Wide image, 1600×600 or larger"><UploadField name="coverImageUrl" defaultValue={event?.coverImageUrl} fields={{ eventId: event?.id }} /></FieldGroup>
          <FieldGroup label="Description" className="sm:col-span-2" hint="Shown in the About section of the public page. Add rules, prizes and timeline as page sections in the Event page tab.">
            <RichTextEditor name="description" defaultValue={event?.description} eventId={event?.id} placeholder="What is this event about? Who is it for?" />
          </FieldGroup>
          <div className="sm:col-span-2">
            <TagsInput
              value={tags}
              onChange={setTags}
              max={MAX_TAGS}
              suggestions={mergeTags(tagSuggestions, SUGGESTED_TAGS).slice(0, 60)}
              hint="Topics and audiences, e.g. AI, Placement, First-year. Students filter events by these."
            />
          </div>
          {type !== "TECH_FEST" && (
            <Field label="Part of a fest" className="sm:col-span-2" hint="Sub-events show on the fest's page with their own register button.">
              <Select name="parentEventId" defaultValue={event?.parentEventId ?? ""}>
                <option value="">Not part of a fest</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </Field>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Where" description="Central events are open to every campus." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Level">
            <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="CENTRAL">Central (all campuses)</option>
              <option value="CAMPUS">Campus level</option>
            </Select>
          </Field>
          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              {EVENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </Select>
          </Field>
          {scope === "CAMPUS" && (
            <Field label="Campuses" className="sm:col-span-2" hint={campuses.length ? undefined : "Add campuses in Brand settings first."}>
              <div className="flex flex-wrap gap-2">
                {campuses.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="checkbox" name="campusIds" value={c.id} defaultChecked={initialCampuses.includes(c.id)} className="accent-[rgb(var(--primary))]" />
                    {c.name}
                  </label>
                ))}
              </div>
            </Field>
          )}
          {mode !== "ONLINE" && <Field label="Venue"><Input name="venue" defaultValue={event?.venue ?? ""} placeholder="Auditorium, Block A" /></Field>}
          {mode !== "OFFLINE" && <Field label="Meeting link"><Input name="meetingUrl" type="url" defaultValue={event?.meetingUrl ?? ""} placeholder="https://meet.google.com/…" /></Field>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="When & registration" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts"><Input type="datetime-local" name="startsAt" required defaultValue={toLocalInput(event?.startsAt)} /></Field>
          <Field label="Ends"><Input type="datetime-local" name="endsAt" required defaultValue={toLocalInput(event?.endsAt)} /></Field>
          <Field label="Registration opens"><Input type="datetime-local" name="registrationOpensAt" defaultValue={toLocalInput(event?.registrationOpensAt)} /></Field>
          <Field label="Registration closes"><Input type="datetime-local" name="registrationClosesAt" defaultValue={toLocalInput(event?.registrationClosesAt)} /></Field>
          <Field label="Capacity" hint="Leave empty for unlimited"><Input type="number" name="capacity" min={1} defaultValue={event?.capacity ?? ""} /></Field>
          <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" name="requiresApproval" defaultChecked={event?.requiresApproval} className="accent-[rgb(var(--primary))]" />Registrations need approval</label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pricing" description="Paid registrations are collected online with Razorpay. Manage coupons in the Payments tab." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 inline-flex w-fit rounded-brand border border-border bg-bg p-1 text-sm" role="radiogroup" aria-label="Free or paid">
            {([[false, "Free"], [true, "Paid"]] as const).map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={paid === v} onClick={() => setPaid(v)}
                className={`rounded-[calc(var(--radius)-4px)] px-4 py-1.5 font-medium ${paid === v ? "bg-card text-primary shadow-sm" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          {paid && (
            <>
              <Field label="Registration fee (₹)"><Input name="feeRupees" type="number" min={1} step="0.01" required defaultValue={paiseToRupees(event?.feeAmount)} placeholder="499" /></Field>
              <Field label="Charged">
                <Select name="feeType" defaultValue={event?.feeType ?? "PER_PERSON"}>
                  <option value="PER_PERSON">Per person</option>
                  <option value="PER_TEAM">Per team</option>
                </Select>
              </Field>
              <Field label="Early-bird price (₹)" hint="Optional"><Input name="earlyBirdRupees" type="number" min={0} step="0.01" defaultValue={paiseToRupees(event?.earlyBirdAmount)} placeholder="299" /></Field>
              <Field label="Early bird ends"><Input name="earlyBirdEndsAt" type="datetime-local" defaultValue={toLocalInput(event?.earlyBirdEndsAt)} /></Field>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Modules" description="Defaults come from the event type you picked above. Switch on whatever this event needs." />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(MODULE_HELP) as (keyof EventModules)[]).map((k) => (
            <label key={k} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="checkbox" checked={modules[k]} onChange={(e) => setModules({ ...modules, [k]: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
              <span><span className="block text-sm font-medium">{humanize(k)}</span><span className="text-xs text-muted">{MODULE_HELP[k]}</span></span>
            </label>
          ))}
        </CardBody>
      </Card>

      {(isHack || modules.submissions) && (
        <Card>
          <CardHeader title="Hackathon settings" description="Team size, how teams register, tracks and the submission window." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {isHack && (
              <>
                <Field label="Min team size" hint="Including the leader"><Input type="number" name="minTeamSize" min={1} defaultValue={event?.config?.minTeamSize ?? 2} /></Field>
                <Field label="Max team size"><Input type="number" name="maxTeamSize" min={1} defaultValue={event?.config?.maxTeamSize ?? 4} /></Field>
                <Field label="Team registration" className="sm:col-span-2" hint="With “Leader adds the team”, the leader enters every member's name and email while registering; members get an email.">
                  <Select name="teamRegistration" defaultValue={(event?.config?.teamRegistration as string) ?? "LEADER_ADDS"}>
                    <option value="LEADER_ADDS">Leader adds the whole team when registering</option>
                    <option value="JOIN_LATER">Register individually, form or join teams later</option>
                  </Select>
                </Field>
                <Field label="Tracks" hint="One per line. Optional description after “ - ”, e.g. “Fintech - Payments for Bharat”" className="sm:col-span-2">
                  <Textarea name="tracks" defaultValue={(event?.config?.tracks ?? []).map((t) => t.name + (t.description ? ` - ${t.description}` : "")).join("\n")} placeholder={"AI for Education\nFintech for Bharat\nOpen Innovation"} />
                </Field>
              </>
            )}
            {modules.submissions && (
              <>
                <Field label="Submissions open" hint="Empty = open while the event runs"><Input type="datetime-local" name="submissionsOpenAt" defaultValue={toLocalInput(event?.submissionsOpenAt)} /></Field>
                <Field label="Submissions close"><Input type="datetime-local" name="submissionsCloseAt" defaultValue={toLocalInput(event?.submissionsCloseAt)} /></Field>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : event ? "Save changes" : "Create event"}</Button>
      </div>
    </form>
  );
}
