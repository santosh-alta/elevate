import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, ExternalLink, Images, MapPin, Trophy, Users, Video } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { eventCampuses, eventCount, fmtDateTime, fmtRange, humanize } from "@/lib/format";
import type { ElevateEvent, LeaderboardRow, Media, Registration, Team } from "@/lib/types";
import { EventCover, ModeBadge } from "@/components/event-card";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, LinkButton, Select, StatusBadge, Table, Td, Textarea, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { CopyButton } from "@/components/client/misc";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const e = await apiGet<ElevateEvent>(`/events/${encodeURIComponent(slug)}`);
  return e ? { title: e.title, description: e.tagline ?? undefined } : { title: "Event" };
}

export default async function EventPage({ params }: Params) {
  const { slug } = await params;
  const event = await apiGet<ElevateEvent>(`/events/${encodeURIComponent(slug)}`);
  if (!event) notFound();

  const me = await getMe();
  const [myRegs, myTeams, media, leaderboard] = await Promise.all([
    me ? apiList<Registration>("/me/registrations") : Promise.resolve([]),
    me && event.modules?.teams ? apiList<Team>(`/me/teams?eventId=${event.id}`) : Promise.resolve([]),
    apiList<Media>(`/events/${event.id}/media`),
    event.resultsPublishedAt ? apiList<LeaderboardRow>(`/events/${event.id}/leaderboard`) : Promise.resolve([]),
  ]);
  const registration = myRegs.find((r) => r.eventId === event.id && r.status !== "CANCELLED");
  const myTeam = myTeams.find((t) => t.eventId === event.id) ?? myTeams[0];
  const campuses = eventCampuses(event);
  const regs = eventCount(event, "registrations");
  const album = event.driveFolderUrl ?? media.find((m) => m.kind === "PHOTO_ALBUM")?.url;
  const tracks = event.config?.tracks ?? [];

  return (
    <div>
      <div className="relative">
        <EventCover event={event} className="h-56 sm:h-72" />
      </div>
      <div className="mx-auto max-w-6xl px-4">
        <div className="-mt-16 relative rounded-brand border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={event.status} />
            <Badge tone="primary">{humanize(event.type)}</Badge>
            <ModeBadge mode={event.mode} />
            <Badge>{event.scope === "CENTRAL" ? "Central event" : "Campus event"}</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{event.title}</h1>
          {event.tagline && <p className="mt-2 text-lg text-muted">{event.tagline}</p>}
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <Info icon={<CalendarDays className="h-4 w-4" />} label="When" value={fmtRange(event.startsAt, event.endsAt)} />
            <Info
              icon={event.mode === "ONLINE" ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              label="Where"
              value={[event.venue, event.scope === "CENTRAL" ? "All campuses" : campuses.map((c) => c.name).join(", "), event.mode !== "OFFLINE" ? "Online" : null].filter(Boolean).join(" · ") || "To be announced"}
            />
            <Info icon={<Users className="h-4 w-4" />} label="Seats" value={event.capacity ? `${regs ?? 0} / ${event.capacity} registered` : `${regs ?? 0} registered`} />
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {event.description && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">About</h2>
                <div className="whitespace-pre-line leading-relaxed text-fg/90">{event.description}</div>
              </section>
            )}

            {tracks.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Tracks</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tracks.map((t) => (
                    <Card key={t.id} className="p-4"><p className="font-medium">{t.name}</p>{t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}</Card>
                  ))}
                </div>
              </section>
            )}

            {(event.sessions?.length ?? 0) > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Schedule</h2>
                <ol className="relative space-y-4 border-l border-border pl-6">
                  {event.sessions!.map((s) => (
                    <li key={s.id}>
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                      <p className="flex items-center gap-1.5 text-xs text-muted"><Clock className="h-3 w-3" />{fmtDateTime(s.startsAt)}</p>
                      <p className="font-medium">{s.title}</p>
                      {(s.speaker || s.location) && <p className="text-sm text-muted">{[s.speaker, s.location].filter(Boolean).join(" · ")}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(event.guests?.length ?? 0) > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Speakers & guests</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {event.guests!.map((g) => (
                    <Card key={g.id} className="flex gap-4 p-4">
                      {g.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.photoUrl} alt={g.name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">{g.name.slice(0, 1)}</div>
                      )}
                      <div>
                        <p className="font-semibold">{g.name}</p>
                        <p className="text-sm text-muted">{[g.designation, g.organization].filter(Boolean).join(", ")}</p>
                        {g.bio && <p className="mt-2 line-clamp-3 text-sm text-fg/80">{g.bio}</p>}
                        {g.linkedinUrl && <a href={g.linkedinUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">LinkedIn ↗</a>}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {leaderboard.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-accent" />Results</h2>
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

            {album && (
              <section>
                <Card className="flex items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3"><Images className="h-6 w-6 text-primary" /><div><p className="font-medium">Event photos</p><p className="text-sm text-muted">See all the moments from this event.</p></div></div>
                  <LinkButton href={album} external variant="outline">Open album <ExternalLink className="h-4 w-4" /></LinkButton>
                </Card>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <RegistrationBox event={event} registration={registration} signedIn={!!me} />
            {event.modules?.teams && registration && <TeamBox event={event} team={myTeam} />}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div><p className="text-xs text-muted">{label}</p><p className="font-medium">{value}</p></div>
    </div>
  );
}

function RegistrationBox({ event, registration, signedIn }: { event: ElevateEvent; registration?: Registration; signedIn: boolean }) {
  const open = event.status === "REGISTRATION_OPEN";
  const form = Array.isArray((event as unknown as { registrationForm?: unknown }).registrationForm)
    ? ((event as unknown as { registrationForm: { id: string; label: string; type?: string; required?: boolean; options?: string[] }[] }).registrationForm)
    : [];

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
