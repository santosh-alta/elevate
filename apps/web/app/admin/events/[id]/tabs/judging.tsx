import { ExternalLink, Trash2 } from "lucide-react";
import { apiList } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";
import type { Criterion, ElevateEvent, JudgeAssignment, LeaderboardRow, Round, Team } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Stat, Table, Td, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { RubricEditor } from "./rubric-editor";
import { PublishResults } from "./publish-results";

export async function JudgingTab({ event }: { event: ElevateEvent }) {
  const [teams, rubric, rounds, judges] = await Promise.all([
    apiList<Team>(`/events/${event.id}/teams`),
    apiList<Criterion>(`/events/${event.id}/rubric`),
    apiList<Round>(`/events/${event.id}/rounds`),
    apiList<JudgeAssignment>(`/events/${event.id}/judges`),
  ]);
  const leaderboards = await Promise.all(
    (rounds.length ? rounds : [null]).map(async (r) => ({
      round: r,
      rows: await apiList<LeaderboardRow>(`/events/${event.id}/leaderboard${r ? `?roundId=${r.id}` : ""}`),
    })),
  );
  const tracks = event.config?.tracks ?? [];
  const submitted = teams.filter((t) => t.submittedAt).length;
  const finalBoard = leaderboards[leaderboards.length - 1]?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Teams" value={teams.length} />
        <Stat label="Submitted" value={submitted} hint={teams.length ? `${Math.round((submitted / teams.length) * 100)}%` : undefined} />
        <Stat label="Judges" value={new Set(judges.map((j) => j.userId)).size} />
        <Stat label="Results" value={event.resultsPublishedAt ? "Published" : "Not yet"} hint={event.resultsPublishedAt ? fmtDateTime(event.resultsPublishedAt) : undefined} />
      </div>

      <Card>
        <CardHeader title="Teams & submissions" />
        {teams.length ? (
          <Table>
            <thead><tr><Th>Team</Th><Th>Members</Th><Th>Project</Th><Th>Links</Th><Th>Result</Th></tr></thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <Td><p className="font-medium">{t.name}</p><p className="text-xs text-muted">{tracks.find((x) => x.id === t.trackId)?.name ?? ""}{t.inviteCode ? ` · ${t.inviteCode}` : ""}</p></Td>
                  <Td className="text-xs text-muted">{(t.members ?? []).map((m) => m.user?.name + (m.isLeader ? " ★" : "")).join(", ") || "—"}</Td>
                  <Td>{t.projectTitle ?? <span className="text-muted">—</span>}{t.submittedAt ? <Badge tone="green" className="ml-2">Submitted</Badge> : <Badge className="ml-2">Draft</Badge>}</Td>
                  <Td>
                    <div className="flex gap-2 text-xs">
                      {([["Repo", t.repoUrl], ["Demo", t.demoUrl], ["Deck", t.deckUrl], ["Video", t.videoUrl]] as const).filter(([, u]) => u).map(([l, u]) => (
                        <a key={l} href={u!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">{l}<ExternalLink className="h-3 w-3" /></a>
                      ))}
                    </div>
                  </Td>
                  <Td>{t.award ? <Badge tone="amber">{humanize(t.award)}</Badge> : t.rank ? `#${t.rank}` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No teams yet" description="Registered participants create or join teams from the event page or the app." /></div>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Judging rubric" description="Weighted criteria judges score on the mobile app" />
          <CardBody><RubricEditor eventId={event.id} initial={rubric} /></CardBody>
        </Card>

        <Card>
          <CardHeader title="Rounds" description="Open a round to let judges score it" />
          <ul className="divide-y divide-border">
            {rounds.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.isOpen ? "Open for scoring" : r.closedAt ? `Closed ${fmtDateTime(r.closedAt)}` : "Not open yet"}</p></div>
                <ApiButton method="PATCH" path={`/rounds/${r.id}`} body={{ isOpen: !r.isOpen }} size="sm" variant={r.isOpen ? "outline" : "primary"}>{r.isOpen ? "Close round" : "Open round"}</ApiButton>
              </li>
            ))}
            {!rounds.length && <li className="px-5 py-4 text-sm text-muted">No rounds yet. Add one, e.g. “Screening” or “Finals”.</li>}
          </ul>
          <CardBody className="border-t border-border">
            <ApiForm path={`/events/${event.id}/rounds`} className="flex gap-2">
              <Input name="name" required placeholder="Round name" />
              <Input name="sortOrder:number" type="number" placeholder="Order" className="w-24" defaultValue={rounds.length + 1} />
              <Button type="submit">Add</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Judges" description="Judges sign in to the mobile app with this email to see their assigned teams" />
        <ul className="divide-y divide-border">
          {judges.map((j) => (
            <li key={j.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium">{j.user?.name ?? j.userId}</p>
                <p className="text-xs text-muted">{j.user?.email} · {j.round?.name ?? "All rounds"} · {j.team?.name ?? "All teams"}</p>
              </div>
              <ApiButton method="DELETE" path={`/judges/${j.id}`} variant="ghost" size="sm" confirm="Remove this judge assignment?"><Trash2 className="h-4 w-4" /></ApiButton>
            </li>
          ))}
          {!judges.length && <li className="px-5 py-4 text-sm text-muted">No judges assigned yet.</li>}
        </ul>
        <CardBody className="border-t border-border">
          <ApiForm path={`/events/${event.id}/judges`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto]">
            <Input name="email" type="email" required placeholder="judge@company.com" />
            <Input name="name" placeholder="Name (if new)" />
            <Select name="roundId" defaultValue=""><option value="">All rounds</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Select name="teamIds:array" defaultValue=""><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Button type="submit">Add judge</Button>
          </ApiForm>
        </CardBody>
      </Card>

      {leaderboards.map(({ round, rows }) => (
        <Card key={round?.id ?? "all"}>
          <CardHeader title={`Leaderboard${round ? ` — ${round.name}` : ""}`} description="Weighted average across judges (submitted scores only)" />
          {rows.length ? (
            <Table>
              <thead><tr><Th>Rank</Th><Th>Team</Th><Th>Score</Th><Th>Judges scored</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.team.id}>
                    <Td className="font-semibold">#{r.rank}</Td>
                    <Td>{r.team.name}</Td>
                    <Td className="tabular-nums">{r.avgWeighted.toFixed(2)}</Td>
                    <Td className="tabular-nums">{r.judgesScored}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <CardBody className="text-sm text-muted">No submitted scores yet.</CardBody>}
        </Card>
      ))}

      <Card>
        <CardHeader title="Publish results" description="Awards appear on the public page and generate winner certificates" />
        <CardBody><PublishResults eventId={event.id} teams={teams} ranking={finalBoard} published={!!event.resultsPublishedAt} /></CardBody>
      </Card>
    </div>
  );
}
