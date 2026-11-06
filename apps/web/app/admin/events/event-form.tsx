"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_MODULES, EVENT_MODES, EVENT_TYPE_LABELS, type EventModules, type EventType } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { EVENT_TYPE_GROUPS, humanize, toLocalInput } from "@/lib/format";
import { UploadField } from "@/components/client/uploader";
import type { Campus, ElevateEvent } from "@/lib/types";

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

export function EventForm({ campuses, event }: { campuses: Campus[]; event?: ElevateEvent }) {
  const router = useRouter();
  const [type, setType] = useState<EventType>(event?.type ?? "HACKATHON");
  const [scope, setScope] = useState(event?.scope ?? "CENTRAL");
  const [mode, setMode] = useState(event?.mode ?? "OFFLINE");
  const [modules, setModules] = useState<EventModules>({ ...DEFAULT_MODULES[event?.type ?? "HACKATHON"], ...(event?.modules ?? {}) });
  const initialCampuses = (event?.campuses ?? []).map((c) => ("campus" in c ? c.campus.id : c.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHack = modules.teams;
  const typeHint = isHack ? "Teams, submissions and judging are switched on." : modules.guests ? "Guests, check-in and certificates are switched on." : undefined;

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => (fd.get(k) as string | null)?.trim() || undefined;
        const d = (k: string) => (s(k) ? new Date(s(k)!).toISOString() : undefined);
        const body: Record<string, unknown> = {
          title: s("title"), tagline: s("tagline"), description: s("description"), type, scope, mode,
          campusIds: scope === "CAMPUS" ? fd.getAll("campusIds") : [],
          venue: s("venue"), meetingUrl: s("meetingUrl"), coverImageUrl: s("coverImageUrl"),
          startsAt: d("startsAt"), endsAt: d("endsAt"),
          registrationOpensAt: d("registrationOpensAt"), registrationClosesAt: d("registrationClosesAt"),
          capacity: s("capacity") ? Number(s("capacity")) : undefined,
          requiresApproval: fd.get("requiresApproval") === "on",
          modules,
        };
        if (isHack) {
          const tracks = (s("tracks") ?? "").split("\n").map((t) => t.trim()).filter(Boolean)
            .map((name, i) => ({ id: `t${i + 1}`, name }));
          body.config = {
            ...(event?.config ?? {}),
            minTeamSize: s("minTeamSize") ? Number(s("minTeamSize")) : undefined,
            maxTeamSize: s("maxTeamSize") ? Number(s("maxTeamSize")) : undefined,
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
        <CardHeader title="Basics" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2"><Input name="title" required minLength={3} defaultValue={event?.title} placeholder="e.g. Build for Bharat Hackathon 2026" /></Field>
          <Field label="Tagline" className="sm:col-span-2"><Input name="tagline" defaultValue={event?.tagline ?? ""} placeholder="One line that sells it" /></Field>
          <Field label="Event type" hint={event ? "Type can't change after creation. Duplicate the event instead." : typeHint}>
            <Select value={type} disabled={!!event} onChange={(e) => { const t = e.target.value as EventType; setType(t); setModules({ ...DEFAULT_MODULES[t] }); }}>
              {EVENT_TYPE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.types.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Cover image" hint="Wide image, 1600×600 or larger"><UploadField name="coverImageUrl" defaultValue={event?.coverImageUrl} fields={{ eventId: event?.id }} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={5} defaultValue={event?.description ?? ""} /></Field>
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
        <CardHeader title="Modules" description="Defaults depend on event type. Switch on whatever this event needs." />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(MODULE_HELP) as (keyof EventModules)[]).map((k) => (
            <label key={k} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="checkbox" checked={modules[k]} onChange={(e) => setModules({ ...modules, [k]: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
              <span><span className="block text-sm font-medium">{humanize(k)}</span><span className="text-xs text-muted">{MODULE_HELP[k]}</span></span>
            </label>
          ))}
        </CardBody>
      </Card>

      {isHack && (
        <Card>
          <CardHeader title="Teams & tracks" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Min team size"><Input type="number" name="minTeamSize" min={1} defaultValue={event?.config?.minTeamSize ?? 2} /></Field>
            <Field label="Max team size"><Input type="number" name="maxTeamSize" min={1} defaultValue={event?.config?.maxTeamSize ?? 4} /></Field>
            <Field label="Tracks / problem statements" hint="One per line" className="sm:col-span-2">
              <Textarea name="tracks" defaultValue={(event?.config?.tracks ?? []).map((t) => t.name).join("\n")} placeholder={"AI for Education\nFintech for Bharat\nOpen Innovation"} />
            </Field>
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
