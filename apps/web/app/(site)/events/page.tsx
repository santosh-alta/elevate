import type { Metadata } from "next";
import { EVENT_MODES, EVENT_TYPES } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { Button, EmptyState, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenant = await requireTenant();
  const qs = new URLSearchParams();
  if (sp.type) qs.set("type", sp.type);
  if (sp.campusId) qs.set("campusId", sp.campusId);
  if (sp.when !== "all") qs.set("upcoming", "1");
  let events = await apiList<ElevateEvent>(`/events?${qs}`);
  if (sp.mode) events = events.filter((e) => e.mode === sp.mode);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Events</h1>
      <p className="mt-1 text-muted">Find hackathons, workshops, seminars and more across {tenant.name}.</p>

      <form className="mt-6 grid gap-3 rounded-brand border border-border bg-card p-4 sm:grid-cols-5">
        <Select name="type" defaultValue={sp.type ?? ""}>
          <option value="">All types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </Select>
        <Select name="campusId" defaultValue={sp.campusId ?? ""}>
          <option value="">All campuses</option>
          {tenant.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="mode" defaultValue={sp.mode ?? ""}>
          <option value="">Online & offline</option>
          {EVENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
        </Select>
        <Select name="when" defaultValue={sp.when ?? "upcoming"}>
          <option value="upcoming">Upcoming</option>
          <option value="all">All events</option>
        </Select>
        <Button type="submit">Apply filters</Button>
      </form>

      <div className="mt-8">
        {events.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>
        ) : (
          <EmptyState title="No events match these filters" description="Try another campus or event type." />
        )}
      </div>
    </div>
  );
}
