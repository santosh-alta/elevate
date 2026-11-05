import { Trash2 } from "lucide-react";
import { apiList } from "@/lib/api";
import type { ElevateEvent, Guest } from "@/lib/types";
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";

const GUEST_STATUSES = ["PROPOSED", "INVITED", "CONFIRMED", "DECLINED", "ARRIVED", "THANKED"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }));
const GUEST_ROLES = ["SPEAKER", "CHIEF_GUEST", "PANELIST", "JUDGE"];

export async function GuestsTab({ event }: { event: ElevateEvent }) {
  const guests = await apiList<Guest>(`/events/${event.id}/guests`);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {guests.length ? guests.map((g) => (
          <Card key={g.id} className="flex flex-col gap-4 p-4 sm:flex-row">
            {g.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.photoUrl} alt={g.name} className="h-20 w-20 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full bg-amber-50 text-[10px] font-medium text-amber-700">Photo<br />pending</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-sm text-muted">{[g.designation, g.organization].filter(Boolean).join(", ") || "Designation pending"}</p>
                  <p className="text-xs text-muted">{[g.role?.replace("_", " ").toLowerCase(), g.email, g.linkedinUrl ? "LinkedIn ✓" : null].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-start gap-1">
                  <ApiSelect path={`/guests/${g.id}`} field="status" value={g.status} options={GUEST_STATUSES} className="w-32" />
                  <ApiButton method="DELETE" path={`/guests/${g.id}`} variant="ghost" size="sm" confirm={`Remove ${g.name}?`}><Trash2 className="h-4 w-4" /></ApiButton>
                </div>
              </div>
              {g.bio ? <p className="mt-2 line-clamp-2 text-sm text-fg/80">{g.bio}</p> : <p className="mt-2 text-xs text-amber-700">Bio pending</p>}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-primary">Update photo / bio</summary>
                <ApiForm method="PATCH" path={`/guests/${g.id}`} className="mt-2 grid gap-2" resetOnSuccess={false}>
                  <Input name="photoUrl" type="url" placeholder="Photo URL" defaultValue={g.photoUrl ?? ""} />
                  <Input name="designation" placeholder="Designation" defaultValue={g.designation ?? ""} />
                  <Textarea name="bio" placeholder="Short bio" defaultValue={g.bio ?? ""} />
                  <Button size="sm" type="submit" className="justify-self-start">Save</Button>
                </ApiForm>
              </details>
            </div>
          </Card>
        )) : <EmptyState title="No guests yet" description="Add speakers, chief guests or panelists to track invites, photos, bios and thank-you notes." />}
      </div>
      <Card className="h-fit">
        <CardHeader title="Add guest" />
        <CardBody>
          <ApiForm path={`/events/${event.id}/guests`} className="space-y-3">
            <Field label="Name"><Input name="name" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role"><Select name="role" defaultValue="SPEAKER">{GUEST_ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ").toLowerCase()}</option>)}</Select></Field>
              <Field label="Status"><Select name="status" defaultValue="PROPOSED">{GUEST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
            </div>
            <Field label="Designation"><Input name="designation" placeholder="CTO" /></Field>
            <Field label="Organisation"><Input name="organization" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><Input name="email" type="email" /></Field>
              <Field label="Phone"><Input name="phone" /></Field>
            </div>
            <Field label="Photo URL"><Input name="photoUrl" type="url" /></Field>
            <Field label="LinkedIn"><Input name="linkedinUrl" type="url" /></Field>
            <Field label="Bio"><Textarea name="bio" /></Field>
            <Button type="submit" className="w-full">Add guest</Button>
          </ApiForm>
        </CardBody>
      </Card>
    </div>
  );
}
