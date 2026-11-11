import Link from "next/link";
import { ArrowRight, Award, CalendarDays, MapPin, Users } from "lucide-react";
import { CountUp } from "@/components/client/count-up";
import { EVENT_FAMILIES, resolveTheme } from "@elevate/shared";
import { apiListPublicFor } from "@/lib/api";
import { notFound } from "next/navigation";
import { tenantForHost } from "@/lib/tenant";
import { eventFamily, participantCount } from "@/lib/format";
import { EventIcon } from "@/components/event-icon";
import type { ElevateEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { LinkButton } from "@/components/ui";
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

  const short = tenant.name.split(" ")[0];
  return (
    <>
      <section className="relative isolate overflow-hidden bg-hero-bg text-hero-fg">
        <HeroVideo url={theme.heroVideoUrl} />
        {/* Aurora: slowly drifting brand-colour glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-24 -top-32 h-[28rem] w-[28rem] animate-aurora rounded-full opacity-40 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
          <div className="absolute -bottom-40 right-1/4 h-[24rem] w-[24rem] animate-aurora-slow rounded-full opacity-30 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
          <div className="absolute -left-32 top-1/3 h-[20rem] w-[20rem] animate-aurora rounded-full opacity-20 blur-3xl" style={{ background: "rgb(var(--hero-accent))" }} />
          <div className="bg-grid absolute inset-0" />
        </div>
        {theme.iconUrl && !theme.heroVideoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.iconUrl} alt="" aria-hidden className="pointer-events-none absolute -right-16 top-1/2 -z-10 hidden h-[130%] max-h-[560px] w-auto -translate-y-1/2 opacity-[0.12] md:block" />
        )}
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pb-28 sm:pt-24">
          <p className="glass inline-flex animate-fade-up items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-hero-fg/90">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-hero-accent" aria-hidden />
            {live.length ? `Live now at ${short}` : `${tenant.name} Events`}
          </p>
          <h1 className="mt-6 max-w-3xl animate-fade-up font-heading text-4xl font-extrabold leading-[1.04] tracking-tight [animation-delay:80ms] sm:text-6xl lg:text-7xl">
            {headline.before}<span className="text-gradient-brand">{headline.word}</span>{headline.after}
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up text-lg text-hero-fg/85 [animation-delay:160ms] sm:text-xl">{subline}</p>
          <div data-tour="home-cta" className="mt-9 flex animate-fade-up flex-wrap gap-3 [animation-delay:240ms]">
            <LinkButton href="/events" size="lg" variant="cta">Explore events <ArrowRight className="h-4 w-4" /></LinkButton>
            <LinkButton href="/me" size="lg" variant="ghost" className="glass text-hero-fg hover:bg-hero-fg/15">My tickets &amp; certificates</LinkButton>
          </div>
          {past.length > 0 && (
            <dl data-tour="home-stats" className="mt-14 grid max-w-2xl animate-fade-up grid-cols-3 gap-3 [animation-delay:320ms] sm:gap-4">
              <HeroStat icon={<CalendarDays className="h-4 w-4" />} value={past.length} label="Events held" />
              <HeroStat icon={<Users className="h-4 w-4" />} value={totalParticipants} label="Participants" />
              <HeroStat icon={<Award className="h-4 w-4" />} value={tenant.campuses.length} label="Campuses" />
            </dl>
          )}
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" />
      </section>

      {tenant.campuses.length > 1 && (
        <div data-tour="home-campuses" className="marquee overflow-hidden border-b border-border bg-card py-4">
          <div className="flex w-max animate-marquee gap-3 pr-3">
            {[...tenant.campuses, ...tenant.campuses].map((c, i) => (
              <Link
                key={`${c.id}-${i}`}
                href={`/campuses/${c.code.toLowerCase()}`}
                tabIndex={i >= tenant.campuses.length ? -1 : undefined}
                aria-hidden={i >= tenant.campuses.length || undefined}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-bg px-4 py-2 text-sm font-medium text-fg/80 transition hover:border-accent/60 hover:text-fg"
              >
                <MapPin className="h-4 w-4 text-accent" />{short} {c.region ?? c.city ?? c.name}
                <span className="text-muted">·</span><span className="text-muted">{c.name.replace(/\s*\([^)]*\)\s*$/, "")}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-20 px-4 py-16">
        {live.length > 0 && (
          <Section eyebrow="Right now" title="Happening now">
            <Grid events={live} />
          </Section>
        )}
        <Section eyebrow="Explore" title="Browse by type" tour="home-types">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {EVENT_FAMILIES.map((f) => {
              const n = upcoming.filter((e) => eventFamily(e) === f.key).length;
              return (
                <li key={f.key} data-reveal className={f.key === "FESTS" ? "col-span-2 sm:col-span-1" : undefined}>
                  <Link
                    href={`/events?family=${f.key}${n ? "" : "&when=all"}`}
                    className="card-glow group flex h-full flex-col gap-4 rounded-brand border border-border/80 bg-card p-5 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-hero-bg text-hero-accent shadow-soft transition duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      <EventIcon name={f.icon} className="h-6 w-6" />
                    </span>
                    <span className="font-heading text-base font-bold leading-tight">{f.label}</span>
                    <span className="mt-auto flex items-center justify-between text-xs text-muted">
                      {n ? `${n} upcoming` : "See past events"}
                      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section eyebrow="Coming up" title="Upcoming events" action={<ViewAll href="/events" />} tour="home-upcoming">
          {next.length ? <Grid events={next.slice(0, 6)} /> : (
            <div className="bg-dots rounded-brand border border-dashed border-border p-10 text-center">
              <span className="mx-auto flex h-14 w-14 animate-float items-center justify-center rounded-2xl bg-hero-bg text-hero-accent"><CalendarDays className="h-7 w-7" /></span>
              <p className="mt-4 font-heading text-lg font-bold">New events are on the way</p>
              <p className="mt-1 text-sm text-muted">Hackathons, masterclasses and guest talks will show up here as soon as they’re announced.</p>
            </div>
          )}
        </Section>
        {past.length > 0 && (
          <Section eyebrow="Highlights" title="Past events" action={<ViewAll href="/events?when=past" />}>
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

function HeroStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="glass rounded-brand px-4 py-3 sm:px-5 sm:py-4">
      <dt className="flex items-center gap-1.5 text-hero-fg/80">{icon}<span className="text-xs sm:text-sm">{label}</span></dt>
      <dd className="mt-1 font-heading text-2xl font-bold sm:text-4xl"><CountUp value={value} /></dd>
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/5">
      View all <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function Section({ eyebrow, title, action, children, tour }: { eyebrow?: string; title: string; action?: React.ReactNode; children: React.ReactNode; tour?: string }) {
  return (
    <section data-tour={tour}>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>}
          <h2 className="mt-1 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <div className="mt-3 h-1 w-12 rounded-full bg-brand-gradient" aria-hidden />
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Grid({ events }: { events: ElevateEvent[] }) {
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>;
}
