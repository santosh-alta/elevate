import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, CalendarDays, ChevronRight, Clock, CreditCard, Download, ExternalLink, Eye, Gavel, Images, Mail, MapPin, Phone, Radio, Sparkles, Star, Ticket, Trophy, Users, Video,
} from "lucide-react";
import { SPONSOR_TIERS, resolveTheme } from "@elevate/shared";
import { absoluteUrl } from "@/lib/theme";
import { apiGet, apiList } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { SocialEmbeds } from "@/components/social-embeds";
import { getOrigin, getTenant } from "@/lib/tenant";
import { eventCampuses, eventCount, eventLabel, fmtDateTime, fmtRange, googleCalendarUrl, humanize, isImage, participantCount, turnoutLabel, campusHref } from "@/lib/format";
import { toGalleryPage } from "@/lib/gallery";
import type { ElevateEvent, Guest, Media, Registration, Sponsor, Team, Winner } from "@/lib/types";
import { EventCover, ModeBadge } from "@/components/event-card";
import { Badge, Card, CardBody, CardHeader, LinkButton, StatusBadge } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { AddToCalendar, Countdown, ShareButtons } from "@/components/client/event-public";
import { SectionNav } from "@/components/client/section-nav";
import { GalleryGrid } from "@/components/client/gallery-grid";
import { GuestAvatar } from "@/components/guest-avatar";
import { RichText, htmlToText } from "@/components/rich-text";
import { MyTeamCard, PriceTag, ProblemStatementCard, WinnersPodium } from "@/components/event-extras";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

function eventPath(slug: string, preview?: string) {
  return `/events/${encodeURIComponent(slug)}${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`;
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const [e, tenant, origin] = await Promise.all([apiGet<ElevateEvent>(eventPath(slug, preview)), getTenant(), getOrigin()]);
  if (!e) return { title: "Event" };
  const description = e.tagline ?? (htmlToText(e.description).slice(0, 180) || `${eventLabel(e)} by ${tenant?.name ?? "us"}`);
  const url = `${origin}/events/${e.slug}`;
  const theme = resolveTheme(tenant?.theme);
  const cover = absoluteUrl(e.coverImageUrl, origin);
  const fallback = absoluteUrl(theme.ogImageUrl ?? theme.logoUrl, origin);
  const images = cover ? [{ url: cover, alt: e.title }] : fallback ? [{ url: fallback, alt: tenant?.name ?? e.title }] : undefined;
  const large = !!cover || !!theme.ogImageUrl;
  return {
    title: e.title,
    description,
    alternates: { canonical: url },
    robots: preview ? { index: false, follow: false } : undefined,
    openGraph: { type: "website", title: e.title, description, url, siteName: tenant ? `${tenant.name} Events` : undefined, images },
    twitter: { card: large ? "summary_large_image" : "summary", title: e.title, description, images: images?.map((i) => i.url) },
  };
}


export default async function EventPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const event = await apiGet<ElevateEvent>(eventPath(slug, preview));
  if (!event) notFound();
  const site = await getTenant();
  const theme = resolveTheme(site?.theme);

  const me = await getMe();
  const [myRegs, myTeams, galleryRaw, media, sponsorsList, legacyBoard, origin] = await Promise.all([
    me ? apiList<Registration>("/me/registrations") : Promise.resolve([]),
    me && event.modules?.teams && event.myTeam === undefined ? apiList<Team>(`/me/teams?eventId=${event.id}`) : Promise.resolve([]),
    apiGet<unknown>(`/events/${event.id}/gallery`),
    event.gallery || event.driveFolderUrl ? Promise.resolve([] as Media[]) : apiList<Media>(`/events/${event.id}/media`),
    event.sponsors ? Promise.resolve(event.sponsors) : apiList<Sponsor>(`/events/${event.id}/sponsors`),
    event.resultsPublishedAt && !event.winners ? apiList<{ team: Team; rank: number }>(`/events/${event.id}/leaderboard`) : Promise.resolve([]),
    getOrigin(),
  ]);
  const registration = myRegs.find((r) => r.eventId === event.id && r.status !== "CANCELLED");
  const myTeam = event.myTeam ?? myTeams.find((t) => t.eventId === event.id) ?? myTeams[0] ?? null;
  const campuses = eventCampuses(event);
  const regs = eventCount(event, "registrations");
  const album = event.driveFolderUrl ?? media.find((m) => m.kind === "PHOTO_ALBUM")?.url;
  const tracks = event.config?.tracks ?? [];
  const galleryPage = galleryRaw ? toGalleryPage(galleryRaw) : {
    items: (event.gallery ?? media.filter((m) => m.kind === "PHOTO" && isImage(m))).slice().sort((a, b) => Number(!!b.isHighlight) - Number(!!a.isHighlight)),
    nextCursor: null,
  };
  const guests = (event.guests ?? []).filter((g) => g.isPublic !== false);
  const faqs = (event.faqs ?? []).filter((f) => f.q);
  const sections = (Array.isArray(event.pageSections) ? event.pageSections : []).filter((s) => s.title && htmlToText(s.html));
  const problems = (event.problemStatements ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const rubric = event.rubricPublic ?? [];
  const subEvents = event.subEvents ?? [];
  const winners: Winner[] = event.winners ?? legacyBoard.filter((r) => r.team.award).map((r) => ({
    teamId: r.team.id, teamName: r.team.name, award: r.team.award, rank: r.team.rank ?? r.rank, projectTitle: r.team.projectTitle,
  }));
  const isPreview = ["DRAFT", "PLANNING"].includes(event.status);
  const pageUrl = `${origin}/events/${event.slug}`;
  const ended = new Date(event.endsAt).getTime() < Date.now();
  // Venue first; add the campus only when the venue doesn't already name it (e.g. venue "ADYPU, Pune" + campus ADYPU).
  const venueText = (event.venue ?? "").toLowerCase();
  const namedInVenue = (c: { name: string; code?: string | null }) => {
    const core = c.name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
    return !!venueText && (venueText.includes(core) || (!!c.code && new RegExp(`\\b${c.code.toLowerCase()}\\b`).test(venueText)));
  };
  const campusText = event.scope === "CENTRAL" ? (event.venue ? null : "Central (HQ)") : campuses.filter((c) => !namedInVenue(c)).map((c) => c.name).join(" + ");
  const where = [event.venue, campusText, event.mode !== "OFFLINE" ? "Online" : null]
    .filter(Boolean).join(" · ") || "To be announced";
  const registerHref = `/events/${event.slug}/register`;
  const isTeamEvent = !!event.modules?.teams;
  // After the event: what happened (recorded figures for events run before the site, else registrations).
  const people = participantCount(event);
  const teamCount = Number(event.config?.teams ?? 0) || (isTeamEvent ? eventCount(event, "teams") ?? 0 : 0);
  const prizePool = typeof event.config?.prizePool === "string" ? event.config.prizePool : null;
  const outcomeLine = ended && people
    ? [turnoutLabel(event), teamCount && `${teamCount} teams`, prizePool && `${prizePool} prize pool`].filter(Boolean).join(" · ")
    : null;

  const nav: { id: string; label: string }[] = [
    ...(winners.length ? [{ id: "winners", label: "Winners" }] : []),
    ...(event.description ? [{ id: "about", label: "About" }] : []),
    ...(subEvents.length ? [{ id: "events", label: "Events" }] : []),
    ...sections.map((s) => ({ id: `section-${s.id}`, label: s.title })),
    ...(tracks.length ? [{ id: "tracks", label: "Tracks" }] : []),
    ...(problems.length ? [{ id: "problems", label: "Problem statements" }] : []),
    ...(event.sessions?.length ? [{ id: "agenda", label: "Agenda" }] : []),
    ...(rubric.length ? [{ id: "judging", label: "Judging" }] : []),
    ...(guests.length ? [{ id: "speakers", label: "Speakers" }] : []),
    ...(galleryPage.items.length || album ? [{ id: "gallery", label: "Gallery" }] : []),
    ...(event.highlights?.length ? [{ id: "community", label: "From the community" }] : []),
    ...(sponsorsList.length ? [{ id: "sponsors", label: "Sponsors" }] : []),
    ...(faqs.length ? [{ id: "faqs", label: "FAQs" }] : []),
  ];

  return (
    <div>
      {isPreview && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900">
          <Eye className="mr-1.5 inline h-4 w-4" />Preview: this page is not public yet. Only people with this link can see it.
        </div>
      )}
      <section className="relative isolate overflow-hidden bg-hero-bg text-hero-fg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -right-24 -top-32 h-96 w-96 animate-aurora rounded-full opacity-40 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
          <div className="absolute -bottom-40 left-1/4 h-80 w-80 animate-aurora-slow rounded-full opacity-25 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-24 pt-8 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-28">
          <div className="order-2 min-w-0 lg:order-1">
            {event.parentEvent && (
              <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-hero-fg/80">
                <Link href={`/events/${event.parentEvent.slug}`} className="font-medium text-hero-fg underline decoration-accent decoration-2 underline-offset-4">{event.parentEvent.title}</Link>
                <ChevronRight className="h-3.5 w-3.5" /><span className="truncate">{event.title}</span>
              </nav>
            )}
            <div className="flex animate-fade-up flex-wrap gap-2">
              <StatusBadge status={event.status} />
              <Badge tone="highlight">{eventLabel(event)}</Badge>
              {event.mode !== "OFFLINE" && <ModeBadge mode={event.mode} />}
            </div>
            <h1 className="mt-5 animate-fade-up font-heading text-4xl font-extrabold leading-[1.06] tracking-tight [animation-delay:60ms] sm:text-5xl lg:text-6xl">{event.title}</h1>
            {event.tagline && <p className="mt-4 max-w-xl animate-fade-up text-lg text-hero-fg/85 [animation-delay:120ms]">{event.tagline}</p>}
            <div className="mt-5 h-1.5 w-20 animate-fade-up rounded-full bg-brand-gradient [animation-delay:160ms]" aria-hidden />
            <div className="mt-6 flex animate-fade-up flex-wrap items-center gap-4 [animation-delay:200ms]">
              {event.status === "REGISTRATION_OPEN" && !registration && (
                <LinkButton href={me ? registerHref : `/login?next=${encodeURIComponent(registerHref)}`} size="lg" variant="cta">
                  {isTeamEvent ? "Register your team" : "Register now"} <ArrowRight className="h-4 w-4" />
                </LinkButton>
              )}
              {registration?.status === "PENDING_PAYMENT" && <LinkButton href={registerHref} size="lg" variant="cta"><CreditCard className="h-4 w-4" />Complete payment</LinkButton>}
              {registration && registration.status !== "PENDING_PAYMENT" && (
                <a href="#register" className="inline-flex items-center gap-2 rounded-full bg-hero-fg/10 px-4 py-2 text-sm font-medium ring-1 ring-inset ring-hero-fg/25 hover:bg-hero-fg/15"><Ticket className="h-4 w-4" />You&apos;re registered · view ticket</a>
              )}
              <span className="rounded-full bg-card px-3 py-1.5 text-fg shadow-sm"><PriceTag event={event} size="sm" /></span>
            </div>
            {!ended && event.status !== "CANCELLED" && <div className="mt-6"><Countdown startsAt={event.startsAt} endsAt={event.endsAt} tone="dark" /></div>}
          </div>
          <div className="order-1 lg:order-2">
            <div className="group relative mr-3 mb-3 animate-fade-up [animation-delay:120ms] [perspective:1200px] sm:mr-4 sm:mb-4">
              <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 rounded-brand bg-brand-gradient-diagonal opacity-90 blur-[1px] transition duration-500 group-hover:translate-x-4 group-hover:translate-y-4 sm:translate-x-4 sm:translate-y-4" />
              <div className="relative overflow-hidden rounded-brand bg-hero-bg shadow-2xl ring-1 ring-hero-fg/10 transition duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(-4deg)_rotateX(2deg)]">
                <EventCover event={event} className="aspect-[16/9] h-auto" iconUrl={theme.iconUrl} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative -mt-14 animate-fade-up rounded-brand border border-border/70 bg-card p-5 shadow-lift [animation-delay:240ms] sm:p-6">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <Info icon={<CalendarDays className="h-4 w-4" />} label="When" value={fmtRange(event.startsAt, event.endsAt)} />
            <Info
              icon={event.mode === "ONLINE" ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              label="Where"
              value={where}
              link={event.venueMapUrl
                ? { href: event.venueMapUrl, label: "Open map" }
                : event.scope === "CAMPUS" && campuses.length === 1
                  ? { href: campusHref(campuses[0]), label: "About this campus" }
                  : undefined}
            />
            <Info
              icon={<Users className="h-4 w-4" />}
              {...(outcomeLine
                ? { label: "Participation", value: outcomeLine }
                : ended
                ? { label: "Status", value: event.status === "CANCELLED" ? "Cancelled" : "Completed" }
                : {
                    label: isTeamEvent && event.config?.maxTeamSize ? `Teams of ${[event.config.minTeamSize, event.config.maxTeamSize].filter(Boolean).join("–")}` : "Seats",
                    value: event.capacity ? `${regs ?? 0} / ${event.capacity} registered` : `${regs ?? 0} registered`,
                  })}
            />
          </div>
          {!!event.tags?.length && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Topics</span>
              <ul className="flex flex-wrap gap-1.5">
                {event.tags.map((t) => (
                  <li key={t}>
                    <Link href={`/events?tag=${encodeURIComponent(t)}&when=all`} className="inline-flex rounded-full bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">#{t}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex flex-wrap gap-2">
              {myTeam && <LinkButton href={`/events/${event.slug}/team`} size="sm" variant="secondary"><Users className="h-4 w-4" />My team</LinkButton>}
              {event.livestreamUrl && <LinkButton href={event.livestreamUrl} external size="sm" variant="secondary"><Radio className="h-4 w-4" />Watch livestream</LinkButton>}
              {event.meetingUrl && event.mode !== "OFFLINE" && registration && registration.status !== "PENDING_PAYMENT" && <LinkButton href={event.meetingUrl} external size="sm" variant="secondary"><Video className="h-4 w-4" />Join online</LinkButton>}
              <AddToCalendar icsUrl={`/api/proxy/events/${event.slug}/calendar.ics`} googleUrl={googleCalendarUrl(event, pageUrl)} />
            </div>
            {!isPreview && <ShareButtons url={pageUrl} title={event.title} />}
          </div>
        </div>

        <SectionNav items={nav} />

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="min-w-0 space-y-12 lg:col-span-2">
            {winners.length > 0 && (
              <Section id="winners" title="Winners" icon={<Trophy className="h-5 w-5 text-accent" />}>
                <WinnersPodium winners={winners} />
              </Section>
            )}

            {event.description && (
              <Section id="about" title="About">
                <RichText html={event.description} />
              </Section>
            )}

            {subEvents.length > 0 && (
              <Section id="events" title={`Events at ${event.title}`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {subEvents.map((s) => (
                    <div key={s.id} className="flex flex-col overflow-hidden rounded-brand border border-border bg-card shadow-sm">
                      <Link href={`/events/${s.slug}`} className="group">
                        <EventCover event={s as ElevateEvent} className="h-28" />
                        <div className="space-y-1 p-4 pb-2">
                          <div className="flex flex-wrap gap-1.5"><Badge tone="primary">{eventLabel(s)}</Badge><ModeBadge mode={s.mode} /></div>
                          <p className="font-semibold group-hover:text-primary">{s.title}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="h-3.5 w-3.5" />{fmtDateTime(s.startsAt)}</p>
                        </div>
                      </Link>
                      <div className="mt-auto flex gap-2 p-4 pt-2">
                        {s.status === "REGISTRATION_OPEN" && <LinkButton href={`/events/${s.slug}/register`} size="sm" variant="cta">Register</LinkButton>}
                        <LinkButton href={`/events/${s.slug}`} size="sm" variant="outline">Details</LinkButton>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {sections.map((s) => (
              <Section key={s.id} id={`section-${s.id}`} title={s.title}>
                <RichText html={s.html} />
              </Section>
            ))}

            {tracks.length > 0 && (
              <Section id="tracks" title="Tracks">
                <div className="grid gap-3 sm:grid-cols-2">
                  {tracks.map((t) => (
                    <Card key={t.id} className="p-4"><p className="font-medium">{t.name}</p>{t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}</Card>
                  ))}
                </div>
              </Section>
            )}

            {problems.length > 0 && (
              <Section id="problems" title="Problem statements">
                <div className="space-y-3">{problems.map((p) => <ProblemStatementCard key={p.id} p={p} tracks={tracks} />)}</div>
              </Section>
            )}

            {(event.sessions?.length ?? 0) > 0 && (
              <Section id="agenda" title="Agenda">
                <ol className="relative space-y-5 border-l border-border pl-6">
                  {event.sessions!.map((s) => (
                    <li key={s.id} className="relative">
                      <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                      <p className="flex items-center gap-1.5 text-xs text-muted"><Clock className="h-3 w-3" />{fmtDateTime(s.startsAt)}</p>
                      <p className="font-medium">{s.title}</p>
                      {(s.speaker || s.location) && <p className="text-sm text-muted">{[s.speaker, s.location].filter(Boolean).join(" · ")}</p>}
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {rubric.length > 0 && (
              <Section id="judging" title="How you'll be judged" icon={<Gavel className="h-5 w-5 text-primary" />}>
                <JudgingParameters rubric={rubric} />
              </Section>
            )}

            {guests.length > 0 && <SpeakersSection guests={guests} />}

            {!!event.highlights?.length && (
              <Section id="community" title="From the community" icon={<Sparkles className="h-5 w-5 text-primary" />}>
                <p className="-mt-2 mb-5 text-muted">What participants, guests and the {site?.name ?? "event"} team shared about this event.</p>
                <SocialEmbeds items={event.highlights} />
              </Section>
            )}

            {(galleryPage.items.length > 0 || album) && (
              <Section
                id="gallery" title="Gallery" icon={<Images className="h-5 w-5 text-primary" />}
                action={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {album && <a href={album} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Full album ↗</a>}
                  </div>
                }
              >
                {galleryPage.items.length > 0 ? <GalleryGrid eventId={event.id} initial={galleryPage} /> : (
                  <Card className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-center gap-3"><Images className="h-6 w-6 text-primary" /><div><p className="font-medium">Event photos</p><p className="text-sm text-muted">See all the moments from this event.</p></div></div>
                    <LinkButton href={album!} external variant="outline">Open album <ExternalLink className="h-4 w-4" /></LinkButton>
                  </Card>
                )}
              </Section>
            )}

            {sponsorsList.length > 0 && <SponsorsSection sponsors={sponsorsList} />}

            {faqs.length > 0 && (
              <Section id="faqs" title="Frequently asked questions">
                <div className="divide-y divide-border rounded-brand border border-border bg-card">
                  {faqs.map((f, i) => (
                    <details key={i} className="group px-5 py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                        {f.q}<span className="text-muted transition group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm text-fg/80">{f.a}</p>
                    </details>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-32 lg:self-start">
            <div id="register" className="scroll-mt-32">
              <RegistrationBox event={event} registration={registration} signedIn={!!me} />
            </div>
            {isTeamEvent && myTeam && <MyTeamCard event={event} team={myTeam} payment={event.myPayment} />}
            {isTeamEvent && !myTeam && registration && registration.status !== "PENDING_PAYMENT" && (
              <Card>
                <CardHeader title="Your team" description="You're registered without a team yet." />
                <CardBody><LinkButton href={`/events/${event.slug}/team`} className="w-full">Create or join a team</LinkButton></CardBody>
              </Card>
            )}
            {(event.contactEmail || event.contactPhone) && (
              <Card>
                <CardHeader title="Questions?" description="Reach the organisers" />
                <CardBody className="space-y-2 text-sm">
                  {event.contactEmail && <a href={`mailto:${event.contactEmail}`} className="flex items-center gap-2 text-primary hover:underline"><Mail className="h-4 w-4" />{event.contactEmail}</a>}
                  {event.contactPhone && <a href={`tel:${event.contactPhone}`} className="flex items-center gap-2 text-primary hover:underline"><Phone className="h-4 w-4" />{event.contactPhone}</a>}
                </CardBody>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, icon, action, children }: { id: string; title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function JudgingParameters({ rubric }: { rubric: NonNullable<ElevateEvent["rubricPublic"]> }) {
  const groups = [...new Set(rubric.map((r) => r.roundName ?? ""))];
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const items = rubric.filter((r) => (r.roundName ?? "") === g);
        const totalWeight = items.reduce((a, r) => a + (r.weight || 0), 0) || 1;
        return (
          <div key={g || "all"}>
            {groups.length > 1 && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g || "Every round"}</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((r) => (
                <li key={r.name} className="rounded-brand border border-border bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{r.name}</p>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{Math.round(((r.weight || 0) / totalWeight) * 100)}%</span>
                  </div>
                  {r.description && <p className="mt-0.5 text-sm text-muted">{r.description}</p>}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-primary" style={{ width: `${((r.weight || 0) / totalWeight) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SpeakersSection({ guests }: { guests: Guest[] }) {
  return (
    <section id="speakers" className="scroll-mt-32">
      <h2 className="mb-3 font-heading text-2xl font-bold tracking-tight">Speakers & guests</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {guests.map((g) => (
          <Link key={g.id} href={`/speakers/${g.id}`} className="group flex gap-4 rounded-brand border border-border bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md">
            <GuestAvatar guest={g} size="h-20 w-20" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{humanize(g.role ?? "SPEAKER")}</p>
              <p className="font-semibold group-hover:text-primary">{g.name}</p>
              <p className="text-sm text-muted">{[g.designation, g.organization].filter(Boolean).join(", ")}</p>
              {g.talkTitle && <p className="mt-2 text-sm font-medium text-fg/90">“{g.talkTitle}”</p>}
              {g.sessionAt && <p className="text-xs text-muted">{fmtDateTime(g.sessionAt)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SponsorsSection({ sponsors }: { sponsors: Sponsor[] }) {
  const order = SPONSOR_TIERS as readonly string[];
  const tiers = [...new Set(sponsors.map((s) => s.tier ?? "PARTNER"))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <section id="sponsors" className="scroll-mt-32">
      <h2 className="mb-3 font-heading text-2xl font-bold tracking-tight">Sponsors & partners</h2>
      <div className="space-y-5">
        {tiers.map((tier) => (
          <div key={tier}>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{tier === "TITLE" && <Star className="h-3.5 w-3.5 text-accent" />}{humanize(tier)}{tier === "TITLE" ? " sponsor" : ""}</p>
            <div className={`grid gap-3 ${tier === "TITLE" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
              {sponsors.filter((s) => (s.tier ?? "PARTNER") === tier).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((s) => {
                const inner = s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logoUrl} alt={s.name} className={`${tier === "TITLE" ? "h-16" : "h-10"} max-w-full object-contain`} />
                ) : <span className="font-semibold">{s.name}</span>;
                const cls = "flex min-h-[80px] items-center justify-center rounded-brand border border-border bg-card p-4 transition hover:border-primary/50";
                return s.website
                  ? <a key={s.id} href={s.website} target="_blank" rel="noreferrer" className={cls} title={s.name}>{inner}</a>
                  : <div key={s.id} className={cls} title={s.name}>{inner}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Info({ icon, label, value, link }: { icon: React.ReactNode; label: string; value: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-primary">{icon}</div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-medium">{value}</p>
        {link && (/^https?:/.test(link.href)
          ? <a href={link.href} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">{link.label} ↗</a>
          : <Link href={link.href} className="text-xs font-medium text-primary hover:underline">{link.label} →</Link>)}
      </div>
    </div>
  );
}


function RegistrationBox({ event, registration, signedIn }: { event: ElevateEvent; registration?: Registration; signedIn: boolean }) {
  const open = event.status === "REGISTRATION_OPEN";
  const registerHref = `/events/${event.slug}/register`;
  const team = !!event.modules?.teams && event.config?.teamRegistration !== "JOIN_LATER";

  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-brand-gradient" aria-hidden />
      <CardHeader title="Registration" description={event.registrationClosesAt ? `Closes ${fmtDateTime(event.registrationClosesAt)}` : undefined} />
      <CardBody className="space-y-4">
        {registration?.status === "PENDING_PAYMENT" ? (
          <>
            <div className="flex items-center justify-between"><span className="text-sm text-muted">Your status</span><StatusBadge status={registration.status} /></div>
            <p className="text-sm text-muted">Your seat is held while you complete the payment.</p>
            <LinkButton href={registerHref} className="w-full" size="lg" variant="cta"><CreditCard className="h-4 w-4" />Complete payment</LinkButton>
          </>
        ) : registration ? (
          <>
            <div className="flex items-center justify-between"><span className="text-sm text-muted">Your status</span><StatusBadge status={registration.status} /></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/proxy/registrations/${registration.ticketCode}/qr.png`} alt="Ticket QR code" className="mx-auto h-44 w-44 rounded-lg border border-border bg-white p-2" />
            <p className="text-center font-mono text-xs text-muted">{registration.ticketCode}</p>
            {event.myPayment?.status === "PAID" && (
              <a href={`/api/proxy/payments/${event.myPayment.id}/receipt.pdf`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"><Download className="h-4 w-4" />Payment receipt</a>
            )}
            {event.meetingUrl && event.mode !== "OFFLINE" && <LinkButton href={event.meetingUrl} external className="w-full">Join online <Video className="h-4 w-4" /></LinkButton>}
            {!["CHECKED_IN", "COMPLETED"].includes(registration.status) && event.myPayment?.status !== "PAID" && (
              <ApiButton method="DELETE" path={`/events/${event.id}/register`} variant="ghost" size="sm" confirm="Cancel your registration?">Cancel registration</ApiButton>
            )}
          </>
        ) : !open ? (
          <p className="text-sm text-muted">
            {["DRAFT", "PLANNING", "ANNOUNCED"].includes(event.status) ? "Registrations are not open yet." : "Registrations are closed for this event."}
          </p>
        ) : (
          <>
            <PriceTag event={event} size="sm" />
            {team && <p className="text-sm text-muted">The team leader registers the whole team{event.config?.maxTeamSize ? ` (${[event.config.minTeamSize, event.config.maxTeamSize].filter(Boolean).join("–")} members)` : ""}. Members get an email with their ticket.</p>}
            <LinkButton href={signedIn ? registerHref : `/login?next=${encodeURIComponent(registerHref)}`} className="w-full" size="lg" variant="cta">
              {signedIn ? (team ? "Register your team" : "Register now") : "Sign in to register"}
            </LinkButton>
            {event.requiresApproval && <p className="text-xs text-muted">Registrations are reviewed by the organisers.</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
}
