import { Download, QrCode } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { TicketDesignEditor, type TicketDesign } from "@/components/admin/ticket-design-editor";
import { fmtDateTime } from "@/lib/format";
import type { ElevateEvent, Registration } from "@/lib/types";
import { Button, Card, CardBody, CardHeader, EmptyState, Input, LinkButton, Stat, Table, Td, Th } from "@/components/ui";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";

const REG_STATUSES = ["PENDING_PAYMENT", "REGISTERED", "APPROVED", "WAITLISTED", "REJECTED", "CANCELLED", "CHECKED_IN", "NO_SHOW"].map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));

export async function RegistrationsTab({ event }: { event: ElevateEvent }) {
  const [regs, ticket] = await Promise.all([
    apiList<Registration>(`/events/${event.id}/registrations`),
    apiGet<{ event: TicketDesign | null; brand: TicketDesign | null }>(`/events/${event.id}/ticket-design`),
  ]);
  const count = (s: string) => regs.filter((r) => r.status === s).length;
  const active = regs.filter((r) => !["CANCELLED", "REJECTED"].includes(r.status)).length;
  const checkedIn = count("CHECKED_IN");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Registered" value={active} hint={event.capacity ? `of ${event.capacity} seats` : undefined} />
        <Stat label="Checked in" value={checkedIn} hint={active ? `${Math.round((checkedIn / active) * 100)}% attendance` : undefined} />
        <Stat label="Pending approval" value={event.requiresApproval ? count("REGISTERED") : "—"} />
        <Stat label="Waitlisted" value={count("WAITLISTED")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Participants" action={<LinkButton href={`/api/proxy/events/${event.id}/registrations?format=csv`} external size="sm" variant="outline"><Download className="h-4 w-4" />Export CSV</LinkButton>} />
          {regs.length ? (
            <Table>
              <thead><tr><Th>Name</Th><Th>Registered</Th><Th>Checked in</Th><Th>Status</Th></tr></thead>
              <tbody>
                {regs.map((r) => (
                  <tr key={r.id}>
                    <Td><p className="font-medium">{r.user?.name ?? "—"}</p><p className="text-xs text-muted">{r.user?.email}</p></Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</Td>
                    <Td className="whitespace-nowrap text-muted">{r.checkedInAt ? fmtDateTime(r.checkedInAt) : "—"}</Td>
                    <Td><ApiSelect path={`/registrations/${r.id}`} field="status" value={r.status} options={REG_STATUSES} className="w-36" /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <div className="p-5"><EmptyState title="No registrations yet" description="Share the public event page once registration is open." /></div>}
        </Card>

        <Card className="h-fit p-5">
          <p className="flex items-center gap-2 font-medium"><QrCode className="h-4 w-4 text-primary" />Manual check-in</p>
          <p className="mb-3 mt-1 text-xs text-muted">Open the check-in desk on any phone: scan tickets with the camera, search by name, or check in a whole team.</p>
          <a href={`/checkin/${event.slug}`} target="_blank" rel="noreferrer" className="mb-3 flex w-full items-center justify-center gap-2 rounded-brand bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Open check-in desk ↗</a>
          <a href={`/present/${event.slug}`} target="_blank" rel="noreferrer" className="mb-1 flex w-full items-center justify-center gap-2 rounded-brand border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5">Self check-in screen (projector) ↗</a>
          <p className="mb-3 text-xs text-muted">Show a QR that changes every 30 seconds; students scan it with their phone camera to check themselves in.</p>
          <p className="mb-2 text-xs text-muted">Or type a ticket code:</p>
          <ApiForm path="/checkin" className="space-y-2" onSuccessMessage="checkin">
            <Input name="ticketCode" required placeholder="Ticket code" className="font-mono" />
            <Button type="submit" className="w-full">Check in</Button>
          </ApiForm>
        </Card>
      </div>
      <Card>
        <CardHeader title="Ticket design" description="The standard ticket, or this event's own artwork. We print the name, team, QR code and ticket number on it." />
        <CardBody><TicketDesignEditor eventId={event.id} initial={ticket?.event ?? null} inherited={ticket?.brand ?? null} /></CardBody>
      </Card>
    </div>
  );
}
