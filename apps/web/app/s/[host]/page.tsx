import Link from "next/link";
import { ArrowRight, Award, CalendarDays, Users } from "lucide-react";
import { EVENT_FAMILIES, resolveTheme } from "@elevate/shared";
import { apiListPublicFor } from "@/lib/api";
import { notFound } from "next/navigation";
import { tenantForHost } from "@/lib/tenant";
import { eventFamily, participantCount } from "@/lib/format";
import { EventIcon } from "@/components/event-icon";
import type { ElevateEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { EmptyState, LinkButton } from "@/components/ui";
import { HeroVideo } from "@/components/hero-video";

export default async function HomePage({ params }: { params: Promise<{ host: string }> }) {
  const host = decodeURIComponent((await params).host);
  const [found, upcoming, past] = await Promise.all([
    tenantForHost(host),
    apiListPublicFor<ElevateEvent>(host, "/events?upcoming=1"),
    apiListPublicFor<ElevateEvent>(host, "/events?status=COMPLETED"),
  ]);
  if (!found) notFound();
  const tenant = found;
  const live = upcoming.filter((e) => e.status === "LIVE");
  const next = upcoming.filter((e) => e.status !== "LIVE");
  const totalParticipants = past.reduce((s, e) => s + participantCount(e), 0);
  const theme = resolveTheme(tenant.theme);
  const headlineText = theme.tagline ?? "Learn, build and grow at our events.";
  const settingsTagline = tenant.settings.tagline as string | undefined;
  const subline = settingsTagline && settingsTagline !== headlineText ? settingsTagline : "Hackathons, workshops, seminars and guest lectures, all in one place.";
  const headline = splitHeadline(headlineText);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-hero-bg text-hero-fg">
        <HeroVideo url={theme.heroVideoUrl} />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60"
          style={{ backgroundImage: "radial-gradient(60% 80% at 100% 0%, rgb(var(--gradient-from) / 0.35), transparent 60%), radial-gradient(50% 70% at 85% 100%, rgb(var(--gradient-to) / 0.25), transparent 60%)" }}
        />
        {theme.iconUrl && !theme.heroVideoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.iconUrl} alt="" aria-hidden className="pointer-events-none absolute -right-16 top-1/2 -z-10 hidden h-[130%] max-h-[560px] w-auto -translate-y-1/2 opacity-[0.12] md:block" />
        )}
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-hero-fg/85 sm:text-sm">
            <span className="h-0.5 w-8 rounded-full bg-brand-gradient" aria-hidden />{tenant.name} Events
          </p>
          <h1 className="mt-5 max-w-3xl font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {headline.before}<span className="text-hero-accent">{headline.word}</span>{headline.after}
          </h1>
          <div className="mt-6 h-1.5 w-24 rounded-full bg-brand-gradient" aria-hidden />
          <p className="mt-6 max-w-xl text-lg text-hero-fg/85 sm:text-xl">{subline}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton href="/events" size="lg" variant="cta">Explore events <ArrowRight className="h-4 w-4" /></LinkButton>
            <LinkButton href="/me" size="lg" variant="ghost" className="text-hero-fg ring-1 ring-inset ring-hero-fg/40 hover:bg-hero-fg/10">My tickets &amp; certificates</LinkButton>
          </div>
          {past.length > 0 && (
            <dl className="mt-14 grid max-w-xl grid-cols-3 gap-4 border-t border-hero-fg/15 pt-8 sm:gap-8">
              <HeroStat icon={<CalendarDays className="h-4 w-4" />} value={past.length} label="Events held" />
              <HeroStat icon={<Users className="h-4 w-4" />} value={totalParticipants} label="Participants" />
              <HeroStat icon={<Award className="h-4 w-4" />} value={tenant.campuses.length || "—"} label="Campuses" />
            </dl>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        {live.length > 0 && (
          <Section title="Happening now">
            <Grid events={live} />
          </Section>
        )}
        <Section title="Browse by type">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {EVENT_FAMILIES.map((f) => {
              const n = upcoming.filter((e) => eventFamily(e) === f.key).length;
              return (
                <li key={f.key} className={f.key === "FESTS" ? "col-span-2 sm:col-span-1" : undefined}>
                  <Link
                    href={`/events?family=${f.key}${n ? "" : "&when=all"}`}
                    className="group flex h-full flex-col gap-3 rounded-brand border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-hero-bg text-hero-accent"><EventIcon name={f.icon} className="h-5 w-5" /></span>
                    <span className="font-heading text-base font-bold leading-tight group-hover:underline group-hover:decoration-accent group-hover:decoration-2 group-hover:underline-offset-4">{f.label}</span>
                    <span className="mt-auto text-xs text-muted">{n ? `${n} upcoming` : "See past events"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title="Upcoming events" action={<Link href="/events" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline decoration-accent decoration-2 underline-offset-4 hover:decoration-primary">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}>
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

/** Highlight the last word of the headline (Alta-style coloured keyword), e.g. "… for an AI *World*". */
function splitHeadline(text: string) {
  const m = text.trim().match(/^(.*\s)?(\S+?)([.!?]?)$/);
  return m ? { before: m[1] ?? "", word: m[2], after: m[3] } : { before: text, word: "", after: "" };
}

function HeroStat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-hero-fg/80">{icon}<span className="text-xs sm:text-sm">{label}</span></dt>
      <dd className="mt-1 font-heading text-2xl font-bold sm:text-3xl">{value}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">{title}</h2>
          <div className="mt-2 h-1 w-10 rounded-full bg-brand-gradient" aria-hidden />
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Grid({ events }: { events: ElevateEvent[] }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>;
}
