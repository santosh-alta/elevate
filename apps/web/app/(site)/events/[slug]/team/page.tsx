import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareQuote, Star } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AWARD_LABELS, fmtDateTime } from "@/lib/format";
import type { ElevateEvent, Registration, Team } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, LinkButton, Select, StatusBadge } from "@/components/ui";
import { ApiForm } from "@/components/client/api-form";
import { CopyButton } from "@/components/client/misc";
import { PaymentStatusBadge } from "@/components/payment-status";
import { ProblemStatementCard } from "@/components/event-extras";
import { ProblemChoice, SubmissionForm, TeamMembers } from "./team-client";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "My team", robots: { index: false } };

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const me = await requireUser(`/events/${slug}/team`);
  const event = await apiGet<ElevateEvent>(`/events/${encodeURIComponent(slug)}`);
  if (!event) notFound();
  const [regs, myTeams] = await Promise.all([
    apiList<Registration>("/me/registrations"),
    event.myTeam ? Promise.resolve([] as Team[]) : apiList<Team>(`/me/teams?eventId=${event.id}`),
  ]);
  const reg = regs.find((r) => r.eventId === event.id && r.status !== "CANCELLED");
  const summary = event.myTeam ?? myTeams.find((t) => t.eventId === event.id) ?? null;
  const team = summary ? (await apiGet<Team>(`/teams/${summary.id}`)) ?? summary : null;
  const config = event.config ?? {};
  const tracks = config.tracks ?? [];
  const maxSize = Number(config.maxTeamSize) || 4;
  const problems = (event.problemStatements ?? []).filter((p) => !p.releaseAt || new Date(p.releaseAt).getTime() <= Date.now());

  const header = (
    <div>
      <Link href={`/events/${event.slug}`} className="text-sm text-muted hover:text-fg">← {event.title}</Link>
      <h1 className="mt-2 text-3xl font-bold">{team ? team.name : "Your team"}</h1>
    </div>
  );

  if (!team) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        {header}
        {!reg ? (
          <EmptyState title="You're not registered for this event" action={<LinkButton href={`/events/${event.slug}/register`}>Register</LinkButton>} />
        ) : !event.modules?.teams ? (
          <EmptyState title="This event doesn't use teams" />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader title="Create a team" description="You'll be the leader and get an invite code to share." />
              <CardBody>
                <ApiForm path={`/events/${event.id}/teams`} className="space-y-3">
                  <Input name="name" placeholder="Team name" required minLength={2} />
                  {tracks.length > 0 && <Select name="trackId" defaultValue=""><option value="">Choose a track</option>{tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
                  <Button type="submit" className="w-full">Create team</Button>
                </ApiForm>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Join a team" description="Ask your leader for the invite code." />
              <CardBody>
                <ApiForm path="/teams/join" className="space-y-3">
                  <Input name="inviteCode" placeholder="e.g. 7KX3PQ2M" required className="font-mono uppercase" />
                  <Button type="submit" variant="outline" className="w-full">Join team</Button>
                </ApiForm>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    );
  }

  const isLeader = !!team.members?.find((m) => m.userId === me.user.id)?.isLeader;
  const regOpen = event.status === "REGISTRATION_OPEN";
  const now = Date.now();
  const opensAt = event.submissionsOpenAt ? new Date(event.submissionsOpenAt).getTime() : null;
  const closesAt = event.submissionsCloseAt ? new Date(event.submissionsCloseAt).getTime() : null;
  const windowOpen = (!opensAt || now >= opensAt) && (!closesAt || now <= closesAt) && !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(event.status);
  const windowNote = opensAt && now < opensAt ? `Submissions open ${fmtDateTime(event.submissionsOpenAt)}.`
    : closesAt && now > closesAt ? `Submissions closed ${fmtDateTime(event.submissionsCloseAt)}.`
    : closesAt ? `Submissions close ${fmtDateTime(event.submissionsCloseAt)}. Save drafts any time; press Submit final when you're done.` : undefined;
  const payStatus = team.payment?.status ?? team.paymentStatus ?? event.myPayment?.status;
  const chosen = team.problemStatement ?? problems.find((p) => p.id === team.problemStatementId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          {team.award && <Badge tone="amber"><Star className="h-3 w-3" />{AWARD_LABELS[team.award] ?? team.award}</Badge>}
          {reg && <StatusBadge status={reg.status} />}
          {payStatus && <PaymentStatusBadge status={payStatus} />}
          {team.submittedAt ? <Badge tone="green">Submitted</Badge> : <Badge>Not submitted</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {event.modules?.submissions !== false && (
            <Card>
              <CardHeader title="Project submission" description={team.submittedAt ? `Submitted ${fmtDateTime(team.submittedAt)}` : "Any team member can edit the draft."} />
              <CardBody><SubmissionForm team={team} eventId={event.id} windowOpen={windowOpen} windowNote={windowNote} locked={!!team.submittedAt} /></CardBody>
            </Card>
          )}

          {(team.feedback?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Judges' feedback" description="Shared by the organisers after each check" />
              <CardBody className="space-y-4">
                {team.feedback!.map((f) => (
                  <div key={f.roundName} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{f.roundName}</p>
                      {f.averageScore != null && <span className="text-lg font-semibold tabular-nums">{f.averageScore.toFixed(1)}<span className="text-xs text-muted"> / 100</span></span>}
                    </div>
                    {(f.tags?.length ?? 0) > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{f.tags!.map((t) => <span key={t} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">{t}</span>)}</div>}
                    {(f.comments?.length ?? 0) > 0 && (
                      <ul className="mt-3 space-y-2 text-sm">
                        {f.comments!.map((c, i) => <li key={i} className="flex gap-2"><MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><span className="whitespace-pre-line">{c}</span></li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {(problems.length > 0 || tracks.length > 0) && (
            <Card>
              <CardHeader title="Problem statement" description={isLeader ? "The leader picks the problem your team is solving." : "Chosen by your team leader."} />
              <CardBody className="space-y-4">
                <ProblemChoice team={team} problems={problems} tracks={tracks} canEdit={isLeader && !team.submittedAt} />
                {chosen && <ProblemStatementCard p={chosen} tracks={tracks} />}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Members" description={`${team.members?.length ?? 0} of ${maxSize}`} />
            <CardBody className="space-y-4">
              <TeamMembers team={team} meId={me.user.id} isLeader={isLeader} canEdit={regOpen} maxSize={maxSize} eventSlug={event.slug} />
              {team.inviteCode && config.teamRegistration === "JOIN_LATER" && (
                <div className="flex items-center justify-between rounded-lg bg-bg p-3">
                  <div><p className="text-xs text-muted">Invite code</p><p className="font-mono font-semibold tracking-wider">{team.inviteCode}</p></div>
                  <CopyButton text={team.inviteCode} />
                </div>
              )}
            </CardBody>
          </Card>
          {reg && (
            <Card>
              <CardHeader title="Your ticket" />
              <CardBody className="space-y-2 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/proxy/registrations/${reg.ticketCode}/qr.png`} alt="Ticket QR code" className="mx-auto h-36 w-36 rounded-lg border border-border bg-white p-2" />
                <p className="font-mono text-xs text-muted">{reg.ticketCode}</p>
                {reg.status === "PENDING_PAYMENT" && <LinkButton href={`/events/${event.slug}/register`} size="sm" className="w-full">Complete payment</LinkButton>}
                {event.myPayment?.status === "PAID" && <a href={`/api/proxy/payments/${event.myPayment.id}/receipt.pdf`} target="_blank" rel="noreferrer" className="block text-sm text-primary hover:underline">Payment receipt</a>}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
