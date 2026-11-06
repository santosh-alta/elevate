import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays, Clock, ExternalLink, Eye, Images, Mail, MapPin, Phone, Radio, Star, Trophy, Users, Video,
} from "lucide-react";
import { SPONSOR_TIERS } from "@elevate/shared";
import { apiGet, apiList } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { getOrigin, getTenant } from "@/lib/tenant";
import { eventCampuses, eventCount, fmtDateTime, fmtRange, googleCalendarUrl, humanize, isImage, typeLabel } from "@/lib/format";
import type { ElevateEvent, Guest, LeaderboardRow, Media, Registration, Sponsor, Team } from "@/lib/types";
import { EventCover, ModeBadge } from "@/components/event-card";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, LinkButton, Select, StatusBadge, Table, Td, Textarea, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { CopyButton } from "@/components/client/misc";
import { AddToCalendar, Countdown, ShareButtons } from "@/components/client/event-public";
import { GuestAvatar } from "@/components/guest-avatar";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

function eventPath(slug: string, preview?: string) {
  return `/events/${encodeURIComponent(slug)}${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`;
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const [e, tenant, origin] = await Promise.all([apiGet<ElevateEvent>(eventPath(slug, preview)), getTenant(), getOrigin()]);
  if (!e) return { title: "Event" };
  const description = e.tagline ?? e.description?.slice(0, 180) ?? `${typeLabel(e.type)} by ${tenant?.name ?? "us"}`;
  const url = `${origin}/events/${e.slug}`;
  const images = e.coverImageUrl ? [{ url: e.coverImageUrl, alt: e.title }] : tenant?.theme.logoUrl ? [{ url: tenant.theme.logoUrl }] : undefined;
  return {
    title: e.title,
    description,
    alternates: { canonical: url },
    robots: preview ? { index: false, follow: false } : undefined,
    openGraph: { type: "website", title: e.title, description, url, siteName: tenant ? `${tenant.name} Events` : undefined, images },
    twitter: { card: e.coverImageUrl ? "summary_large_image" : "summary", title: e.title, description, images: images?.map((i) => i.url) },
  };
}

export default async function EventPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const event = await apiGet<ElevateEvent>(eventPath(slug, preview));
  if (!event) notFound();

  const me = await getMe();
  const [myRegs, myTeams, media, leaderboard, sponsorsList, origin] = await Promise.all([
    me ? apiList<Registration>("/me/registrations") : Promise.resolve([]),
    me && event.modules?.teams ? apiList<Team>(`/me/teams?eventId=${event.id}`) : Promise.resolve([]),
    event.gallery ? Promise.resolve([] as Media[]) : apiList<Media>(`/events/${event.id}/media`),
    event.resultsPublishedAt ? apiList<LeaderboardRow>(`/events/${event.id}/leaderboard`) : Promise.resolve([]),
    event.sponsors ? Promise.resolve(event.sponsors) : apiList<Sponsor>(`/events/${event.id}/sponsors`),
    getOrigin(),
  ]);
  const registration = myRegs.find((r) => r.eventId === event.id && r.status !== "CANCELLED");
  const myTeam = myTeams.find((t) => t.eventId === event.id) ?? myTeams[0];
  const campuses = eventCampuses(event);
  const regs = eventCount(event, "registrations");
  const album = event.driveFolderUrl ?? media.find((m) => m.kind === "PHOTO_ALBUM")?.url;
  const tracks = event.config?.tracks ?? [];
  const gallery = (event.gallery ?? media.filter((m) => m.kind === "PHOTO" && isImage(m)))
    .slice().sort((a, b) => Number(!!b.isHighlight) - Number(!!a.isHighlight));
  const guests = (event.guests ?? []).filter((g) => g.isPublic !== false);
  const faqs = (event.faqs ?? []).filter((f) => f.q);
  const isPreview = ["DRAFT", "PLANNING"].includes(event.status);
  const pageUrl = `${origin}/events/${event.slug}`;
  const ended = new Date(event.endsAt).getTime() < Date.now();
  const where = [event.venue, event.scope === "CENTRAL" ? "All campuses" : campuses.map((c) => c.name).join(", "), event.mode !== "OFFLINE" ? "Online" : null]
    .filter(Boolean).join(" · ") || "To be announced";

  return (
    <div>
      {isPreview && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900">
          <Eye className="mr-1.5 inline h-4 w-4" />Preview: this page is not public yet. Only people with this link can see it.
        </div>
      )}
      <div className="relative">
        <EventCover event={event} className="h-56 sm:h-80" />
      </div>
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative -mt-16 rounded-brand border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={event.status} />
            <Badge tone="primary">{typeLabel(event.type)}</Badge>
            <ModeBadge mode={event.mode} />
            <Badge>{event.scope === "CENTRAL" ? "Central event" : "Campus event"}</Badge>
            {campuses.map((c) => <Badge key={c.id} tone="gray"><MapPin className="h-3 w-3" />{c.name}</Badge>)}
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{event.title}</h1>
              {event.tagline && <p className="mt-2 text-lg text-muted">{event.tagline}</p>}
            </div>
            {!ended && event.status !== "CANCELLED" && <Countdown startsAt={event.startsAt} endsAt={event.endsAt} />}
          </div>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <Info icon={<CalendarDays className="h-4 w-4" />} label="When" value={fmtRange(event.startsAt, event.endsAt)} />
            <Info
              icon={event.mode === "ONLINE" ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              label="Where"
              value={where}
              link={event.venueMapUrl ? { href: event.venueMapUrl, label: "Open map" } : undefined}
            />
            <Info icon={<Users className="h-4 w-4" />} label="Seats" value={event.capacity ? `${regs ?? 0} / ${event.capacity} registered` : `${regs ?? 0} registered`} />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex flex-wrap gap-2">
              {event.status === "REGISTRATION_OPEN" && !registration && <LinkButton href="#register" size="sm">Register now</LinkButton>}
              {event.livestreamUrl && <LinkButton href={event.livestreamUrl} external size="sm" variant="secondary"><Radio className="h-4 w-4" />Watch livestream</LinkButton>}
              {event.meetingUrl && event.mode !== "OFFLINE" && registration && <LinkButton href={event.meetingUrl} external size="sm" variant="secondary"><Video className="h-4 w-4" />Join online</LinkButton>}
              <AddToCalendar icsUrl={`/api/proxy/events/${event.slug}/calendar.ics`} googleUrl={googleCalendarUrl(event, pageUrl)} />
            </div>
            {!isPreview && <ShareButtons url={pageUrl} title={event.title} />}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            {event.description && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">About</h2>
                <div className="whitespace-pre-line leading-relaxed text-fg/90">{event.description}</div>
              </section>
            )}

            {guests.length > 0 && <SpeakersSection guests={guests} />}

            {tracks.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Tracks</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tracks.map((t) => (
                    <Card key={t.id} className="p-4"><p className="font-medium">{t.name}</p>{t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}</Card>
                  ))}
                </div>
              </section>
            )}

            {(event.sessions?.length ?? 0) > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Agenda</h2>
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
              </section>
            )}

            {leaderboard.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Trophy className="h-5 w-5 text-accent" />Results</h2>
                <Card>
                  <Table>
                    <thead><tr><Th>Rank</Th><Th>Team</Th><Th>Award</Th></tr></thead>
                    <tbody>
                      {leaderboard.map((r) => (
                        <tr key={r.team.id}>
                          <Td className="font-semibold">#{r.team.rank ?? r.rank}</Td>
                          <Td>{r.team.name}{r.team.projectTitle && <span className="block text-xs text-muted">{r.team.projectTitle}</span>}</Td>
                          <Td>{r.team.award ? <Badge tone="amber">{humanize(r.team.award)}</Badge> : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              </section>
            )}

            {gallery.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl font-semibold"><Images className="h-5 w-5 text-primary" />Gallery</h2>
                  {album && <a href={album} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">Full album ↗</a>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {gallery.slice(0, 12).map((m, i) => (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className={`group relative overflow-hidden rounded-lg ${i === 0 && m.isHighlight ? "col-span-2 row-span-2" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.caption ?? m.title ?? "Event photo"} loading="lazy" className="aspect-square h-full w-full object-cover transition group-hover:scale-105" />
                      {m.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white">{m.caption}</span>}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {gallery.length === 0 && album && (
              <section>
                <Card className="flex items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3"><Images className="h-6 w-6 text-primary" /><div><p className="font-medium">Event photos</p><p className="text-sm text-muted">See all the moments from this event.</p></div></div>
                  <LinkButton href={album} external variant="outline">Open album <ExternalLink className="h-4 w-4" /></LinkButton>
                </Card>
              </section>
            )}

            {sponsorsList.length > 0 && <SponsorsSection sponsors={sponsorsList} />}

            {faqs.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Frequently asked questions</h2>
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
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <div id="register" className="scroll-mt-24">
              <RegistrationBox event={event} registration={registration} signedIn={!!me} />
            </div>
            {event.modules?.teams && registration && <TeamBox event={event} team={myTeam} />}
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

function SpeakersSection({ guests }: { guests: Guest[] }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">Speakers & guests</h2>
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
    <section>
      <h2 className="mb-3 text-xl font-semibold">Sponsors & partners</h2>
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
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-medium">{value}</p>
        {link && <a href={link.href} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">{link.label} ↗</a>}
      </div>
    </div>
  );
}

function RegistrationBox({ event, registration, signedIn }: { event: ElevateEvent; registration?: Registration; signedIn: boolean }) {
  const open = event.status === "REGISTRATION_OPEN";
  const form = Array.isArray(event.registrationForm) ? event.registrationForm : [];

  return (
    <Card>
      <CardHeader title="Registration" description={event.registrationClosesAt ? `Closes ${fmtDateTime(event.registrationClosesAt)}` : undefined} />
      <CardBody className="space-y-4">
        {registration ? (
          <>
            <div className="flex items-center justify-between"><span className="text-sm text-muted">Your status</span><StatusBadge status={registration.status} /></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/proxy/registrations/${registration.ticketCode}/qr.png`} alt="Ticket QR code" className="mx-auto h-44 w-44 rounded-lg border border-border bg-white p-2" />
            <p className="text-center font-mono text-xs text-muted">{registration.ticketCode}</p>
            {event.meetingUrl && event.mode !== "OFFLINE" && <LinkButton href={event.meetingUrl} external className="w-full">Join online <Video className="h-4 w-4" /></LinkButton>}
            {!["CHECKED_IN", "COMPLETED"].includes(registration.status) && (
              <ApiButton method="DELETE" path={`/events/${event.id}/register`} variant="ghost" size="sm" confirm="Cancel your registration?">Cancel registration</ApiButton>
            )}
          </>
        ) : !open ? (
          <p className="text-sm text-muted">
            {["DRAFT", "PLANNING", "ANNOUNCED"].includes(event.status) ? "Registrations are not open yet." : "Registrations are closed for this event."}
          </p>
        ) : !signedIn ? (
          <LinkButton href={`/login?next=/events/${event.slug}`} className="w-full">Sign in to register</LinkButton>
        ) : (
          <ApiForm path={`/events/${event.id}/register`} className="space-y-3" successMessage="You're registered! Your ticket is below.">
            {form.map((q) => (
              <Field key={q.id} label={q.label + (q.required ? " *" : "")}>
                {q.options?.length ? (
                  <Select name={`answers.${q.id}`} required={q.required}>{q.options.map((o) => <option key={o}>{o}</option>)}</Select>
                ) : q.type === "textarea" ? (
                  <Textarea name={`answers.${q.id}`} required={q.required} />
                ) : (
                  <Input name={`answers.${q.id}`} required={q.required} />
                )}
              </Field>
            ))}
            <Button type="submit" className="w-full" size="lg">Register now</Button>
            {event.requiresApproval && <p className="text-xs text-muted">Registrations are reviewed by the organisers.</p>}
          </ApiForm>
        )}
      </CardBody>
    </Card>
  );
}

function TeamBox({ event, team }: { event: ElevateEvent; team?: Team }) {
  const tracks = event.config?.tracks ?? [];
  const size = [event.config?.minTeamSize, event.config?.maxTeamSize].filter(Boolean).join("–");
  if (!team) {
    return (
      <Card>
        <CardHeader title="Your team" description={size ? `Teams of ${size} members` : undefined} />
        <CardBody className="space-y-6">
          <ApiForm path={`/events/${event.id}/teams`} className="space-y-3">
            <p className="text-sm font-medium">Create a team</p>
            <Input name="name" placeholder="Team name" required />
            {tracks.length > 0 && (
              <Select name="trackId" defaultValue=""><option value="">Choose a track</option>{tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            )}
            <Button type="submit" className="w-full">Create team</Button>
          </ApiForm>
          <div className="relative text-center text-xs text-muted"><span className="bg-card px-2">or</span><div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" /></div>
          <ApiForm path="/teams/join" className="space-y-3">
            <p className="text-sm font-medium">Join with an invite code</p>
            <Input name="inviteCode" placeholder="e.g. 7KX3PQ2M" required className="font-mono uppercase" />
            <Button type="submit" variant="outline" className="w-full">Join team</Button>
          </ApiForm>
        </CardBody>
      </Card>
    );
  }
  const canSubmit = ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE"].includes(event.status);
  return (
    <Card>
      <CardHeader title={team.name} description={team.submittedAt ? `Submitted ${fmtDateTime(team.submittedAt)}` : "Not submitted yet"} action={team.award ? <Badge tone="amber">{humanize(team.award)}</Badge> : undefined} />
      <CardBody className="space-y-4">
        {team.inviteCode && (
          <div className="flex items-center justify-between rounded-lg bg-bg p-3">
            <div><p className="text-xs text-muted">Invite code</p><p className="font-mono font-semibold tracking-wider">{team.inviteCode}</p></div>
            <CopyButton text={team.inviteCode} />
          </div>
        )}
        <ul className="space-y-1 text-sm">
          {(team.members ?? []).map((m) => (
            <li key={m.userId} className="flex justify-between"><span>{m.user?.name ?? m.userId}</span>{m.isLeader && <Badge tone="primary">Leader</Badge>}</li>
          ))}
        </ul>
        {event.modules?.submissions !== false && canSubmit && (
          <ApiForm method="PATCH" path={`/teams/${team.id}/submission`} className="space-y-3 border-t border-border pt-4" resetOnSuccess={false} successMessage="Submission saved.">
            <p className="text-sm font-medium">Project submission</p>
            <Input name="projectTitle" placeholder="Project title" defaultValue={team.projectTitle ?? ""} />
            <Textarea name="projectSummary" placeholder="What did you build?" defaultValue={team.projectSummary ?? ""} />
            <Input name="repoUrl" type="url" placeholder="GitHub repo URL" defaultValue={team.repoUrl ?? ""} />
            <Input name="demoUrl" type="url" placeholder="Live demo URL" defaultValue={team.demoUrl ?? ""} />
            <Input name="deckUrl" type="url" placeholder="Pitch deck URL" defaultValue={team.deckUrl ?? ""} />
            <Input name="videoUrl" type="url" placeholder="Demo video URL" defaultValue={team.videoUrl ?? ""} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="submit:bool" className="accent-[rgb(var(--primary))]" /> Final submission</label>
            <Button type="submit" className="w-full">Save submission</Button>
          </ApiForm>
        )}
        <Link href="/me" className="block text-center text-xs text-primary hover:underline">Go to My space</Link>
      </CardBody>
    </Card>
  );
}
