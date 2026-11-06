import Link from "next/link";
import { CheckCircle2, Clock, FileText, Mail, Pencil, Trash2, UserRound } from "lucide-react";
import { apiList } from "@/lib/api";
import { getOrigin } from "@/lib/tenant";
import { GUEST_STATUS_LIST, fmtDateTime, humanize } from "@/lib/format";
import type { ElevateEvent, Guest, Membership } from "@/lib/types";
import { Badge, Card, EmptyState, LinkButton, Stat } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiSelect } from "@/components/client/api-select";
import { CopyButton } from "@/components/client/misc";
import { GuestAvatar } from "@/components/guest-avatar";
import { GuestAdder } from "@/components/admin/guest-adder";
import { GuestEditor } from "@/components/admin/guest-editor";

const STATUS_OPTIONS = GUEST_STATUS_LIST.map((s) => ({ value: s, label: humanize(s) }));

export async function loadStaff(eventId: string): Promise<{ id: string; name: string }[]> {
  const [members, eventStaff] = await Promise.all([
    apiList<Membership>("/admin/members"),
    apiList<{ userId: string; user?: { id: string; name: string } }>(`/events/${eventId}/staff`),
  ]);
  const map = new Map<string, string>();
  for (const m of members) if (m.user && m.role !== "STUDENT") map.set(m.user.id, m.user.name);
  for (const s of eventStaff) if (s.user) map.set(s.user.id, s.user.name);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function GuestsTab({ event, guestId }: { event: ElevateEvent; guestId?: string }) {
  const [guests, staff, origin] = await Promise.all([apiList<Guest>(`/events/${event.id}/guests`), loadStaff(event.id), getOrigin()]);
  const hostName = (g: Guest) => g.host?.name ?? staff.find((s) => s.id === g.hostUserId)?.name;
  const selected = guestId ? guests.find((g) => g.id === guestId) : undefined;

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/admin/events/${event.id}?tab=guests`} className="text-sm text-muted hover:text-fg">← All guests</Link>
          <div className="flex flex-wrap gap-2">
            <GuestActions guest={selected} event={event} origin={origin} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <GuestAvatar guest={selected} size="h-16 w-16" />
          <div>
            <h2 className="text-xl font-semibold">{selected.name}</h2>
            <p className="text-sm text-muted">{humanize(selected.role ?? "SPEAKER")} · {[selected.designation, selected.organization].filter(Boolean).join(", ")}</p>
          </div>
        </div>
        <div className="max-w-4xl"><GuestEditor guest={selected} eventId={event.id} staff={staff} /></div>
      </div>
    );
  }

  const count = (s: string) => guests.filter((g) => g.status === s).length;
  const submitted = guests.filter((g) => g.profileSubmittedAt).length;

  return (
    <div className="space-y-6">
      {guests.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Guests" value={guests.length} />
          <Stat label="Confirmed" value={count("CONFIRMED") + count("ARRIVED") + count("THANKED")} hint={`${count("INVITED")} invited, awaiting reply`} />
          <Stat label="Profiles submitted" value={`${submitted}/${guests.length}`} hint="Photo, bio and travel" />
          <Stat label="Thanked" value={count("THANKED")} />
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {guests.length ? guests.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <GuestAvatar guest={g} size="h-20 w-20" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/admin/events/${event.id}?tab=guests&guest=${g.id}`} className="font-semibold hover:text-primary">{g.name}</Link>
                      <p className="text-sm text-muted">{[g.designation, g.organization].filter(Boolean).join(", ") || "Designation pending"}</p>
                    </div>
                    <div className="flex items-start gap-1">
                      <ApiSelect path={`/guests/${g.id}`} field="status" value={g.status} options={STATUS_OPTIONS} className="w-32" />
                      <ApiButton method="DELETE" path={`/guests/${g.id}`} variant="ghost" size="sm" confirm={`Remove ${g.name} from this event?`}><Trash2 className="h-4 w-4" /></ApiButton>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="primary">{humanize(g.role ?? "SPEAKER")}</Badge>
                    {g.profileSubmittedAt
                      ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Profile submitted</Badge>
                      : <Badge tone="amber"><Clock className="h-3 w-3" />Awaiting profile</Badge>}
                    {!g.photoUrl && <Badge tone="amber">Photo pending</Badge>}
                    {!g.bio && <Badge tone="amber">Bio pending</Badge>}
                    {g.invitedAt && <Badge tone="blue">Invited {fmtDateTime(g.invitedAt)}</Badge>}
                    {g.consentRecording === false && <Badge tone="red">No recording</Badge>}
                  </div>
                  <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
                    <p className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />Host: {hostName(g) ?? <span className="text-amber-700">not assigned</span>}</p>
                    {g.talkTitle && <p className="truncate">Talk: <span className="text-fg">{g.talkTitle}</span></p>}
                    {g.arrivalAt && <p>Arrives {fmtDateTime(g.arrivalAt)}</p>}
                    {g.sessionAt && <p>Session {fmtDateTime(g.sessionAt)}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <LinkButton href={`/admin/events/${event.id}?tab=guests&guest=${g.id}`} size="sm" variant="outline"><Pencil className="h-4 w-4" />Open file</LinkButton>
                    <GuestActions guest={g} event={event} origin={origin} />
                  </div>
                </div>
              </div>
            </Card>
          )) : (
            <EmptyState title="No guests yet" description="Add speakers, chief guests, founders or investors. Send them the invite and they fill their own photo, bio and travel details." />
          )}
        </div>
        <GuestAdder eventId={event.id} staff={staff} />
      </div>
    </div>
  );
}

function GuestActions({ guest, event, origin }: { guest: Guest; event: ElevateEvent; origin: string }) {
  const portal = guest.portalToken ? `${origin}/guest/${guest.portalToken}` : null;
  const after = new Date(event.startsAt) < new Date();
  return (
    <>
      <ApiButton
        path={`/guests/${guest.id}/invite`} size="sm" variant={guest.invitedAt ? "outline" : "primary"}
        successMessage={guest.email ? "Invite queued" : undefined}
        confirm={guest.email ? undefined : "This guest has no email. Add one first, or copy the portal link and share it yourself."}
      >
        <Mail className="h-4 w-4" />{guest.invitedAt ? "Resend invite" : "Send invite"}
      </ApiButton>
      {portal && <CopyButton text={portal} label="Copy portal link" />}
      {(after || ["ARRIVED", "CONFIRMED"].includes(guest.status ?? "")) && guest.status !== "THANKED" && (
        <ApiButton path={`/guests/${guest.id}/thank-you`} size="sm" variant="secondary" successMessage="Thank-you queued">Send thank-you</ApiButton>
      )}
      <LinkButton href={`/admin/events/${event.id}/guests/${guest.id}/brief`} size="sm" variant="ghost"><FileText className="h-4 w-4" />Guest brief</LinkButton>
    </>
  );
}

