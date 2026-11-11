import Link from "next/link";
import { ExternalLink, ThumbsUp, Trash2 } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";
import { normalizeBoard, normalizeLibrary, normalizeProgress, roundTeamIds, type BoardRow, type JudgeProgress } from "@/lib/judging";
import type { Criterion, ElevateEvent, JudgeAssignment, Round, Team } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Stat, Table, Td, Th } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { RoundsManager } from "./rounds-manager";
import { CriteriaPicker } from "./criteria-picker";
import { CommentsManager } from "./comments-manager";
import { PublishResults } from "./publish-results";

export async function JudgingTab({ event, roundId }: { event: ElevateEvent; roundId?: string }) {
  const [teams, rubric, roundsRaw, judges, libraryRaw] = await Promise.all([
    apiList<Team>(`/events/${event.id}/teams`),
    apiList<Criterion>(`/events/${event.id}/rubric`),
    apiList<Round>(`/events/${event.id}/rounds`),
    apiList<JudgeAssignment>(`/events/${event.id}/judges`),
    apiGet<unknown>("/judging/library"),
  ]);
  const rounds = roundsRaw.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const library = normalizeLibrary(libraryRaw);

  // Per-round leaderboards (also feed the "advance" dialog) and judge progress.
  const [boardList, progressList] = await Promise.all([
    Promise.all(rounds.map(async (r) => [r.id, normalizeBoard(await apiGet<unknown>(`/events/${event.id}/leaderboard?roundId=${r.id}`))] as const)),
    Promise.all(rounds.map(async (r) => [r.id, normalizeProgress(await apiGet<unknown>(`/rounds/${r.id}/progress`))] as const)),
  ]);
  const boards: Record<string, BoardRow[]> = Object.fromEntries(boardList);
  const progress: Record<string, JudgeProgress[]> = Object.fromEntries(progressList);
  const shortlists: Record<string, string[]> = Object.fromEntries(rounds.map((r) => [r.id, roundTeamIds(r)]));

  const defaultRound = [...rounds].reverse().find((r) => r.isOpen || r.closedAt) ?? rounds[rounds.length - 1];
  const selected = rounds.find((r) => r.id === roundId) ?? defaultRound;
  const board = selected ? boards[selected.id] ?? [] : normalizeBoard(await apiGet<unknown>(`/events/${event.id}/leaderboard`));
  const lastRound = rounds[rounds.length - 1];
  const finalBoard = lastRound ? boards[lastRound.id] ?? [] : board;
  const finalists = lastRound ? shortlists[lastRound.id] ?? [] : [];

  const tracks = event.config?.tracks ?? [];
  const submitted = teams.filter((t) => t.submittedAt).length;
  const openRound = rounds.find((r) => r.isOpen);
  const config = (event.config ?? {}) as Record<string, unknown>;
  const eventComments = Array.isArray(config.judgeComments) ? (config.judgeComments as string[]) : [];
  const criteriaCols = board[0]?.criteria ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Teams" value={teams.length} />
        <Stat label="Submitted" value={submitted} hint={teams.length ? `${Math.round((submitted / teams.length) * 100)}%` : undefined} />
        <Stat label="Judges" value={new Set(judges.map((j) => j.userId)).size} hint={openRound ? `Scoring: ${openRound.name}` : "No check open"} />
        <Stat label="Results" value={event.resultsPublishedAt ? "Published" : "Not yet"} hint={event.resultsPublishedAt ? fmtDateTime(event.resultsPublishedAt) : undefined} />
      </div>

      <p className="rounded-xl bg-primary/5 px-4 py-3 text-sm">
        Judges score on <a href={`/judge/${event.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">the judging page ↗</a> (phone or laptop).
        Adding a judge emails them the link. Judges without specific teams can score any team; they pick it themselves.
      </p>

      <Card>
        <CardHeader title="Judging checks" description="Rounds judges score in — e.g. First cut, Second check, Final. Advance the best teams from one check to the next." />
        <RoundsManager eventId={event.id} rounds={rounds} teams={teams} progress={progress} boards={boards} shortlists={shortlists} />
      </Card>

      <Card>
        <CardHeader title="Judging parameters" description="What judges score. Each parameter is normalised to its max score and weighted; totals are out of 100." />
        <CardBody><CriteriaPicker eventId={event.id} initial={rubric} rounds={rounds} library={library.criteria} /></CardBody>
      </Card>

      <Card>
        <CardHeader title="Suggested remarks" description="Quick comments judges can tick while scoring. Shared remarks reach teams when a check has “share feedback” on." />
        <CardBody><CommentsManager eventId={event.id} config={config} eventComments={eventComments} library={library.comments} /></CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Leaderboard"
          description="Average across judges of each team's weighted total (submitted scores only)"
          action={rounds.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {rounds.map((r) => (
                <Link key={r.id} href={`/admin/events/${event.id}?tab=judging&round=${r.id}`}
                  className={cn("rounded-full px-3 py-1 text-xs", selected?.id === r.id ? "bg-primary/10 font-medium text-primary" : "text-muted hover:text-fg")}>{r.name}</Link>
              ))}
            </div>
          ) : undefined}
        />
        {board.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Rank</Th><Th>Team</Th><Th className="text-right">Total /100</Th>
                {criteriaCols.map((c) => <Th key={c.id ?? c.name} className="text-right normal-case" title={c.name}>{c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name}</Th>)}
                <Th>Judges</Th><Th><ThumbsUp className="inline h-3.5 w-3.5" /></Th><Th>Remarks</Th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.team.id} className={selected && shortlists[rounds[rounds.indexOf(selected) + 1]?.id ?? ""]?.includes(r.team.id) ? "bg-primary/5" : undefined}>
                  <Td className="font-semibold tabular-nums">#{r.rank}</Td>
                  <Td><p className="font-medium">{r.team.name}</p>{r.team.projectTitle && <p className="text-xs text-muted">{r.team.projectTitle}</p>}</Td>
                  <Td className="text-right text-base font-semibold tabular-nums">{r.total.toFixed(1)}</Td>
                  {criteriaCols.map((c) => {
                    const v = r.criteria.find((x) => (c.id && x.id === c.id) || x.name === c.name);
                    return <Td key={c.id ?? c.name} className="text-right tabular-nums text-muted">{v ? `${v.avg.toFixed(1)}${v.maxScore ? `/${v.maxScore}` : ""}` : "—"}</Td>;
                  })}
                  <Td className="tabular-nums text-muted">{r.judgesDone}{r.judgesAssigned !== undefined ? `/${r.judgesAssigned}` : ""}</Td>
                  <Td>{r.recommendCount > 0 ? <Badge tone="green">{r.recommendCount}</Badge> : <span className="text-muted">0</span>}</Td>
                  <Td className="max-w-xs">
                    {r.remarks.length ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">{r.remarks.length} remark{r.remarks.length === 1 ? "" : "s"}</summary>
                        <ul className="mt-2 space-y-2 text-xs">
                          {r.remarks.map((m, i) => (
                            <li key={i} className="rounded-md bg-bg p-2">
                              <p className="font-medium">{m.judgeName ?? "Judge"}{m.recommend && <span className="ml-1 text-emerald-700">· recommends</span>}</p>
                              {m.comment && <p className="mt-0.5 whitespace-pre-line">{m.comment}</p>}
                              {m.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{m.tags.map((t) => <span key={t} className="rounded-full bg-fg/5 px-2 py-0.5">{t}</span>)}</p>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : <span className="text-xs text-muted">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <CardBody className="text-sm text-muted">{selected ? `No submitted scores in “${selected.name}” yet.` : "Create a check and open it to start scoring."}</CardBody>}
      </Card>

      <Card>
        <CardHeader title="Teams & submissions" />
        {teams.length ? (
          <Table>
            <thead><tr><Th>Team</Th><Th>Members</Th><Th>Project</Th><Th>Links</Th><Th>Result</Th></tr></thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted">{[tracks.find((x) => x.id === t.trackId)?.name, t.problemStatement?.code ?? t.problemStatement?.title, t.inviteCode].filter(Boolean).join(" · ")}</p>
                  </Td>
                  <Td className="text-xs text-muted">{(t.members ?? []).map((m) => m.user?.name + (m.isLeader ? " ★" : "")).join(", ") || "—"}</Td>
                  <Td>{t.projectTitle ?? <span className="text-muted">—</span>}{t.submittedAt ? <Badge tone="green" className="ml-2">Submitted</Badge> : <Badge className="ml-2">Draft</Badge>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {([["Repo", t.repoUrl], ["Demo", t.demoUrl], ["Deck", t.deckUrl], ["Video", t.videoUrl], ...(t.attachments ?? []).map((a) => [a.label, a.url] as const)] as const).filter(([, u]) => u).map(([l, u], i) => (
                        <a key={`${l}${i}`} href={u!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">{l}<ExternalLink className="h-3 w-3" /></a>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    {t.award ? <Badge tone="amber">{humanize(t.award)}</Badge> : t.rank ? `#${t.rank}` : "—"}
                    {t.submittedAt && <ApiButton path={`/teams/${t.id}/unsubmit`} size="sm" variant="ghost" className="ml-1 h-6 px-2 text-xs" confirm={`Unlock ${t.name}'s submission so they can edit it?`}>Unlock</ApiButton>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No teams yet" description="Teams appear as participants register." /></div>}
      </Card>

      <Card>
        <CardHeader title="Judges" description="Judges sign in to the mobile app with this email to see their assigned teams" />
        <ul className="divide-y divide-border">
          {judges.map((j) => (
            <li key={j.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium">{j.user?.name ?? j.userId}</p>
                <p className="text-xs text-muted">{j.user?.email} · {j.round?.name ?? "All checks"} · {j.team?.name ?? "All teams"}</p>
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
            <Select name="roundId" defaultValue=""><option value="">All checks</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Select name="teamIds:array" defaultValue=""><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Button type="submit">Add judge</Button>
          </ApiForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Publish results" description={`Awards and finalists${lastRound ? ` — ranked by “${lastRound.name}”` : ""}. Winners appear on the public page and get winner certificates.`} />
        <CardBody>
          <PublishResults eventId={event.id} teams={teams} ranking={finalBoard.map((r) => ({ teamId: r.team.id, total: r.total }))} finalists={finalists} published={!!event.resultsPublishedAt} />
        </CardBody>
      </Card>
    </div>
  );
}
