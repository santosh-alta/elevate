import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiList } from "@/lib/api";
import { getMe, isReviewer } from "@/lib/auth";
import { eventLabel, fmtDateTime, fmtRange } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, Card, EmptyState, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Review queue" };

/** Event pages submitted by organizers, waiting for an admin or moderator. */
export default async function ReviewQueue() {
  const me = await getMe();
  if (!isReviewer(me)) redirect("/admin/events");
  const [pending, sentBack] = await Promise.all([
    apiList<ElevateEvent>("/events?approval=PENDING&limit=200"),
    apiList<ElevateEvent>("/events?approval=REJECTED&limit=200"),
  ]);
  const byOldest = (a: ElevateEvent, b: ElevateEvent) => +new Date(a.submittedAt ?? a.startsAt) - +new Date(b.submittedAt ?? b.startsAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted">Event pages from organizers. Open one to check it, then approve it (it goes live) or send it back with a note.</p>
      </div>
      <Card>
        {pending.length ? (
          <Table>
            <thead><tr><Th>Event</Th><Th>When</Th><Th>Submitted</Th></tr></thead>
            <tbody>
              {pending.sort(byOldest).map((e) => (
                <tr key={e.id}>
                  <Td>
                    <Link href={`/admin/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
                    <div className="mt-1"><Badge tone="primary">{eventLabel(e)}</Badge></div>
                  </Td>
                  <Td className="text-muted">{fmtRange(e.startsAt, e.endsAt)}</Td>
                  <Td className="text-muted">{e.submittedAt ? fmtDateTime(e.submittedAt) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="Nothing to review" description="When an organizer submits an event page, it shows up here and you get an email." /></div>}
      </Card>
      {sentBack.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold">Sent back, waiting for the organizer</h2>
          <Card>
            <Table>
              <tbody>
                {sentBack.map((e) => (
                  <tr key={e.id}>
                    <Td><Link href={`/admin/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link></Td>
                    <Td className="text-muted">{e.approvalNote}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
