import { Send } from "lucide-react";
import { apiList } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";
import type { Announcement, AppNotification, ElevateEvent } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Stat, StatusBadge, Table, Td, Textarea, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";

const CHANNELS = ["EMAIL", "IN_APP", "PUSH", "WHATSAPP"];

export async function NotificationsTab({ event }: { event: ElevateEvent }) {
  const [outbox, announcements] = await Promise.all([
    apiList<AppNotification>(`/events/${event.id}/notifications`),
    apiList<Announcement>(`/events/${event.id}/announcements`),
  ]);
  const by = (s: string) => outbox.filter((n) => n.status === s).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Messages" value={outbox.length} />
        <Stat label="Sent" value={by("SENT")} />
        <Stat label="Scheduled" value={by("PENDING")} hint="Reminders go out automatically" />
        <Stat label="Failed" value={by("FAILED")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Announcements" description="Sent to everyone registered for this event" />
          {announcements.length ? (
            <ul className="divide-y divide-border">
              {announcements.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted">{a.body}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{(a.channels ?? []).map((c) => <Badge key={c}>{humanize(c)}</Badge>)}</div>
                  </div>
                  {a.sentAt
                    ? <span className="text-xs text-muted">Sent {fmtDateTime(a.sentAt)}</span>
                    : <ApiButton path={`/events/${event.id}/announcements/${a.id}/send`} size="sm" confirm="Send this announcement to all registrants now?" successMessage="Sending…"><Send className="h-4 w-4" />Send now</ApiButton>}
                </li>
              ))}
            </ul>
          ) : <CardBody><EmptyState title="No announcements yet" description="Share venue changes, reminders or results with every registrant." /></CardBody>}
        </Card>

        <Card className="h-fit">
          <CardHeader title="New announcement" />
          <CardBody>
            <ApiForm path={`/events/${event.id}/announcements`} className="space-y-3" successMessage="Saved. Press Send now when ready.">
              <Field label="Title"><Input name="title" required placeholder="Venue changed to Auditorium B" /></Field>
              <Field label="Message"><Textarea name="body" required rows={5} /></Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Channels</legend>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="checkbox" name="channels:array" value={c} defaultChecked={c === "EMAIL" || c === "IN_APP"} className="accent-[rgb(var(--primary))]" />{humanize(c)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" className="w-full">Save announcement</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Message log" description="Confirmations, reminders, guest invites, certificates and feedback requests for this event" />
        {outbox.length ? (
          <Table>
            <thead><tr><Th>Message</Th><Th>To</Th><Th>Channel</Th><Th>Status</Th><Th>Scheduled</Th><Th>Sent</Th></tr></thead>
            <tbody>
              {outbox.map((n) => (
                <tr key={n.id}>
                  <Td><p className="font-medium">{n.subject}</p><p className="font-mono text-[11px] text-muted">{n.template}</p></Td>
                  <Td className="text-sm">{n.user?.name ?? n.toEmail ?? "—"}{n.user?.name && n.toEmail && <span className="block text-xs text-muted">{n.toEmail}</span>}</Td>
                  <Td><Badge>{humanize(n.channel ?? "EMAIL")}</Badge></Td>
                  <Td><StatusBadge status={n.status ?? "PENDING"} />{n.error && <span className="mt-1 block max-w-[200px] truncate text-xs text-red-600" title={n.error}>{n.error}</span>}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(n.scheduledFor)}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(n.sentAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <CardBody><EmptyState title="No messages yet" description="Registration confirmations and reminders will appear here as students register." /></CardBody>}
      </Card>
    </div>
  );
}
