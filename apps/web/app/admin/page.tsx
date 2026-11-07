import Link from "next/link";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { EVENT_FAMILIES } from "@elevate/shared";
import { apiGet, apiList } from "@/lib/api";
import { EventIcon } from "@/components/event-icon";
import { eventCount, eventFamily, eventLabel, familyLabel, fmtDate, fmtRange, humanize } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { StatGrid } from "@/components/kv";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";

type Attention = { event?: ElevateEvent; reason?: string; reasons?: string[]; overdueTasks?: number } & Partial<ElevateEvent>;
interface Dashboard {
  kpis?: Record<string, number>;
  upcoming?: ElevateEvent[];
  live?: ElevateEvent[];
  attention?: Attention[];
  byFamily?: { family: string; label?: string; events: number; registrations?: number; attended?: number }[];
  byTag?: { tag: string; events: number; registrations?: number }[];
  [k: string]: unknown;
}

export default async function AdminDashboard() {
  const [dash, events] = await Promise.all([apiGet<Dashboard>("/dashboard"), apiList<ElevateEvent>("/events")]);
  const now = Date.now();
  const upcoming = dash?.upcoming ?? events.filter((e) => new Date(e.endsAt).getTime() >= now && e.status !== "CANCELLED").sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const live = dash?.live ?? events.filter((e) => e.status === "LIVE");
  const attention: Attention[] = dash?.attention ?? events
    .filter((e) => e.status === "COMPLETED" && !e.driveFolderUrl)
    .map((e) => ({ event: e, reason: "Photos not uploaded yet" }));
  const byFamily = dash?.byFamily ?? EVENT_FAMILIES.map((f) => {
    const list = events.filter((e) => eventFamily(e) === f.key);
    return { family: f.key, label: f.label, events: list.length, registrations: list.reduce((n, e) => n + (eventCount(e, "registrations") ?? 0), 0), attended: undefined as number | undefined };
  });
  const byTag = dash?.byTag ?? [];
  const byStatus = events.reduce<Record<string, number>>((m, e) => ((m[e.status] = (m[e.status] ?? 0) + 1), m), {});

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">Everything happening across your events.</p>
        </div>
        <LinkButton href="/admin/events/new" variant="cta"><CalendarPlus className="h-4 w-4" />Create event</LinkButton>
      </div>

      {dash?.kpis ? (
        <StatGrid data={dash.kpis} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total events" value={events.length} />
          <Stat label="Live now" value={live.length} />
          <Stat label="Upcoming" value={upcoming.length} />
          <Stat label="Completed" value={byStatus.COMPLETED ?? 0} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Upcoming & live" action={<Link href="/admin/events" className="text-sm text-primary hover:underline">All events</Link>} />
          {upcoming.length ? (
            <Table>
              <thead><tr><Th>Event</Th><Th>When</Th><Th>Status</Th></tr></thead>
              <tbody>
                {[...live.filter((l) => !upcoming.some((u) => u.id === l.id)), ...upcoming].slice(0, 10).map((e) => (
                  <tr key={e.id} className="hover:bg-bg">
                    <Td><Link href={`/admin/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link><span className="block text-xs text-muted">{eventLabel(e)} · {humanize(e.mode)}</span></Td>
                    <Td className="text-muted">{fmtRange(e.startsAt, e.endsAt)}</Td>
                    <Td><StatusBadge status={e.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <div className="p-5"><EmptyState title="Nothing scheduled" description="Create your first event to get started." /></div>}
        </Card>

        <Card>
          <CardHeader title="Needs attention" description="Overdue tasks and pending post-event work" />
          <ul className="divide-y divide-border">
            {attention.length ? attention.slice(0, 10).map((a, i) => {
              const ev = a.event ?? (a as ElevateEvent);
              const reasons = a.reasons ?? (a.reason ? [a.reason] : a.overdueTasks ? [`${a.overdueTasks} overdue tasks`] : []);
              return (
                <li key={ev.id ?? i} className="flex gap-3 px-5 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0">
                    <Link href={`/admin/events/${ev.id}`} className="text-sm font-medium hover:text-primary">{ev.title}</Link>
                    <p className="text-xs text-muted">{reasons.join(" · ") || "Check event"}{ev.startsAt ? ` · ${fmtDate(ev.startsAt)}` : ""}</p>
                  </div>
                </li>
              );
            }) : <li className="px-5 py-8 text-center text-sm text-muted">All caught up 🎉</li>}
          </ul>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Events by type" description="Event families, with registrations and attendance" />
          <Table>
            <thead><tr><Th>Type</Th><Th className="w-2/5">Events</Th><Th className="text-right">Regs</Th><Th className="text-right">Attended</Th></tr></thead>
            <tbody>
              {byFamily.map((f) => {
                const max = Math.max(1, ...byFamily.map((x) => x.events));
                const info = EVENT_FAMILIES.find((x) => x.key === f.family);
                return (
                  <tr key={f.family} className="hover:bg-bg">
                    <Td>
                      <Link href={`/admin/events?family=${f.family}`} className="inline-flex items-center gap-2 whitespace-nowrap font-medium hover:text-primary">
                        <EventIcon name={info?.icon} className="h-4 w-4 text-muted" />{f.label ?? familyLabel(f.family)}
                      </Link>
                    </Td>
                    <Td><Bar value={f.events} max={max} /></Td>
                    <Td className="text-right tabular-nums">{f.registrations ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{f.attended ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Top tags" description="Most used topics on your events" action={<Link href="/admin/settings?tab=types" className="text-sm text-primary hover:underline">Event types</Link>} />
          {byTag.length ? (
            <Table>
              <thead><tr><Th>Tag</Th><Th className="w-2/5">Events</Th><Th className="text-right">Regs</Th></tr></thead>
              <tbody>
                {byTag.slice(0, 10).map((t) => (
                  <tr key={t.tag} className="hover:bg-bg">
                    <Td><Link href={`/admin/events?tag=${encodeURIComponent(t.tag)}`} className="font-medium hover:text-primary">#{t.tag}</Link></Td>
                    <Td><Bar value={t.events} max={Math.max(1, ...byTag.map((x) => x.events))} /></Td>
                    <Td className="text-right tabular-nums">{t.registrations ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <div className="p-5"><EmptyState title="No tags yet" description="Add tags like AI or Placement to events to see what's popular." /></div>}
        </Card>
      </div>

      {Object.keys(byStatus).length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-sm font-medium">Events by status</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([s, n]) => <Link key={s} href={`/admin/events?status=${s}`}><Badge tone="gray"><StatusBadge status={s} /> {n}</Badge></Link>)}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Inline bar with the number beside it; the bar itself is decorative. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((value / max) * 100)}%` }} />
      </span>
      <span className="w-8 text-right tabular-nums">{value}</span>
    </span>
  );
}
