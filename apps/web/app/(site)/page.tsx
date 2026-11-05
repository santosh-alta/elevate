import Link from "next/link";
import { ArrowRight, Award, CalendarDays, Users } from "lucide-react";
import { apiList } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { eventCount } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { EmptyState, LinkButton } from "@/components/ui";

export default async function HomePage() {
  const tenant = await requireTenant();
  const [upcoming, past] = await Promise.all([
    apiList<ElevateEvent>("/events?upcoming=1"),
    apiList<ElevateEvent>("/events?status=COMPLETED"),
  ]);
  const live = upcoming.filter((e) => e.status === "LIVE");
  const next = upcoming.filter((e) => e.status !== "LIVE");
  const totalParticipants = past.reduce((s, e) => s + (eventCount(e, "registrations") ?? 0), 0);
  const tagline = (tenant.settings.tagline as string) ?? "Hackathons, workshops, seminars and guest lectures — all in one place.";

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{tenant.name}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">Learn, build and grow at our events.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{tagline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/events" size="lg">Explore events <ArrowRight className="h-4 w-4" /></LinkButton>
            <LinkButton href="/me" size="lg" variant="outline">My tickets & certificates</LinkButton>
          </div>
          {past.length > 0 && (
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              <HeroStat icon={<CalendarDays className="h-4 w-4" />} value={past.length} label="Events held" />
              <HeroStat icon={<Users className="h-4 w-4" />} value={totalParticipants} label="Participants" />
              <HeroStat icon={<Award className="h-4 w-4" />} value={tenant.campuses.length || "—"} label="Campuses" />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        {live.length > 0 && (
          <Section title="Happening now">
            <Grid events={live} />
          </Section>
        )}
        <Section title="Upcoming events" action={<Link href="/events" className="text-sm font-medium text-primary hover:underline">View all</Link>}>
          {next.length ? <Grid events={next.slice(0, 6)} /> : <EmptyState title="No upcoming events yet" description="New events will show up here as soon as they are announced." />}
        </Section>
        {past.length > 0 && (
          <Section title="Past events">
            <Grid events={past.slice(0, 6)} />
          </Section>
        )}
      </div>
    </>
  );
}

function HeroStat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted">{icon}<span className="text-xs">{label}</span></div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Grid({ events }: { events: ElevateEvent[] }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>;
}
