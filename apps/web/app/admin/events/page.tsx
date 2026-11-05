import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { EVENT_STATUSES, EVENT_TYPES } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { eventCampuses, eventCount, fmtRange, humanize } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, Button, Card, EmptyState, LinkButton, Select, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Events" };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenant = await requireTenant();
  const qs = new URLSearchParams();
  for (const k of ["status", "type", "campusId"]) if (sp[k]) qs.set(k, sp[k]!);
  const events = (await apiList<ElevateEvent>(`/events?${qs}`)).sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Events</h1>
        <LinkButton href="/admin/events/new"><CalendarPlus className="h-4 w-4" />Create event</LinkButton>
      </div>
      <form className="grid gap-3 sm:grid-cols-4">
        <Select name="status" defaultValue={sp.status ?? ""}><option value="">Any status</option>{EVENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        <Select name="type" defaultValue={sp.type ?? ""}><option value="">Any type</option>{EVENT_TYPES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        <Select name="campusId" defaultValue={sp.campusId ?? ""}><option value="">Any campus</option>{tenant.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <Card>
        {events.length ? (
          <Table>
            <thead><tr><Th>Event</Th><Th>Type</Th><Th>Where</Th><Th>When</Th><Th>Regs</Th><Th>Status</Th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-bg">
                  <Td><Link href={`/admin/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link></Td>
                  <Td><Badge tone="primary">{humanize(e.type)}</Badge></Td>
                  <Td className="text-muted">{e.scope === "CENTRAL" ? "Central" : eventCampuses(e).map((c) => c.code || c.name).join(", ")} · {humanize(e.mode)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtRange(e.startsAt, e.endsAt)}</Td>
                  <Td className="tabular-nums">{eventCount(e, "registrations") ?? "—"}</Td>
                  <Td><StatusBadge status={e.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6"><EmptyState title="No events found" action={<LinkButton href="/admin/events/new" size="sm">Create event</LinkButton>} /></div>
        )}
      </Card>
    </div>
  );
}
