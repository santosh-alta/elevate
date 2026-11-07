import Link from "next/link";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { fmtDate, fmtRange, humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { StatGrid } from "@/components/kv";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";

type Attention = { event?: ElevateEvent; reason?: string; reasons?: string[]; overdueTasks?: number } & Partial<ElevateEvent>;
interface Dashboard {
  kpis?: Record<string, number>;
  upcoming?: ElevateEvent[];
  live?: ElevateEvent[];
  attention?: Attention[];
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
                    <Td><Link href={`/admin/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link><span className="block text-xs text-muted">{typeLabel(e.type)} · {humanize(e.mode)}</span></Td>
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
