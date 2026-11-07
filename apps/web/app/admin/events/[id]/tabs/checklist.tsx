import { ExternalLink, Link2, Trash2 } from "lucide-react";
import { WORK_TEAMS, WORK_TEAM_LABELS, type WorkTeam } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { getMe, isBrandAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { ElevateEvent, Membership, Task } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Input, Progress, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";

const PHASES = [
  { key: "PRE", label: "Before the event", hint: "Plan · prepare · set up" },
  { key: "DURING", label: "On the day", hint: "Engage · capture · conclude" },
  { key: "POST", label: "After the event (24–48 hours)", hint: "Share · report · stay connected" },
] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));
const TEAM_TONE: Record<WorkTeam, "primary" | "blue" | "purple"> = { OWNER: "primary", OPERATIONS: "blue", SOCIAL_MEDIA: "purple" };
const finished = (t: Task) => t.status === "DONE" || t.status === "SKIPPED";

export async function ChecklistTab({ event }: { event: ElevateEvent }) {
  const [tasks, members, me] = await Promise.all([
    apiList<Task>(`/events/${event.id}/tasks`),
    apiList<Membership>("/admin/members"),
    getMe(),
  ]);
  const staff = members.filter((m) => m.user && m.role !== "STUDENT");
  const people = staff.map((m) => ({ value: m.user!.id, label: m.user!.name }));
  // Ensure current assignees appear even if not in the member list.
  for (const t of tasks) if (t.assignee && !people.some((p) => p.value === t.assignee!.id)) people.push({ value: t.assignee.id, label: t.assignee.name });
  if (event.owner && !people.some((p) => p.value === event.owner!.id)) people.push({ value: event.owner.id, label: event.owner.name });
  const now = new Date();
  const canChangeOwner = isBrandAdmin(me) || me?.user.id === event.ownerId;
  const teamPeople = (team: string) => staff.filter((m) => m.teams?.includes(team)).map((m) => m.user!.name);

  const byTeam = WORK_TEAMS.map((team) => {
    const list = tasks.filter((t) => (t.team ?? "OWNER") === team);
    return {
      team,
      total: list.length,
      done: list.filter(finished).length,
      overdue: list.filter((t) => !finished(t) && t.dueAt && new Date(t.dueAt) < now).length,
      proofMissing: list.filter((t) => t.proofRequired && t.status !== "SKIPPED" && !t.evidenceUrl).length,
    };
  }).filter((x) => x.total > 0);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Event owner</p>
            {canChangeOwner ? (
              <div className="mt-1 w-56"><ApiSelect path={`/events/${event.id}`} field="ownerId" value={event.ownerId} options={people} placeholder="No owner" /></div>
            ) : (
              <p className="mt-1 font-medium">{event.owner?.name ?? "No owner"}</p>
            )}
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            {byTeam.map((x) => {
              const names = x.team === "OWNER" ? [event.owner?.name].filter(Boolean) : teamPeople(x.team);
              return (
                <div key={x.team} className="rounded-brand border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={TEAM_TONE[x.team]}>{WORK_TEAM_LABELS[x.team]}</Badge>
                    <span className="text-xs tabular-nums text-muted">{x.done}/{x.total}</span>
                  </div>
                  <div className="mt-2"><Progress value={(x.done / x.total) * 100} /></div>
                  <p className="mt-2 truncate text-xs text-muted" title={names.join(", ")}>{names.length ? names.join(", ") : "No one in this team yet"}</p>
                  {(x.overdue > 0 || x.proofMissing > 0) && (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      {[x.overdue && `${x.overdue} overdue`, x.proofMissing && `${x.proofMissing} proof link${x.proofMissing > 1 ? "s" : ""} missing`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {PHASES.map(({ key, label, hint }) => {
        const list = tasks.filter((t) => t.phase === key);
        const done = list.filter(finished).length;
        return (
          <Card key={key}>
            <CardHeader title={label} description={hint} action={<div className="flex w-40 items-center gap-2"><Progress value={list.length ? (done / list.length) * 100 : 0} /><span className="text-xs tabular-nums text-muted">{done}/{list.length}</span></div>} />
            <ul className="divide-y divide-border">
              {list.map((t) => {
                const overdue = t.dueAt && new Date(t.dueAt) < now && !finished(t);
                const team = (t.team ?? "OWNER") as WorkTeam;
                const needsProof = t.proofRequired && !t.evidenceUrl && t.status !== "SKIPPED";
                return (
                  <li key={t.id} className="grid items-center gap-3 px-5 py-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={TEAM_TONE[team]}>{WORK_TEAM_LABELS[team]}</Badge>
                        {t.proofRequired && <Badge tone={needsProof ? "amber" : "green"}><Link2 className="h-3 w-3" />{needsProof ? "Proof link needed" : "Proof added"}</Badge>}
                      </div>
                      <p className={cn("mt-1 text-sm font-medium", t.status === "DONE" && "text-muted line-through")}>{t.title}</p>
                      <p className={cn("text-xs", overdue ? "font-medium text-red-600" : "text-muted")}>
                        Due {fmtDate(t.dueAt)}{overdue ? " · overdue" : ""}
                        {t.evidenceUrl && <> · <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">proof <ExternalLink className="h-3 w-3" /></a></>}
                      </p>
                    </div>
                    <ApiSelect path={`/tasks/${t.id}`} field="status" value={t.status} options={STATUSES} className="w-32" />
                    <ApiSelect path={`/tasks/${t.id}`} field="assigneeId" value={t.assigneeId} options={people} placeholder={team === "OWNER" ? "Unassigned" : `${WORK_TEAM_LABELS[team]} team`} className="w-44" />
                    <ApiForm method="PATCH" path={`/tasks/${t.id}`} className="flex gap-1" resetOnSuccess={false}>
                      <Input name="evidenceUrl" type="url" placeholder={t.proofRequired ? "Post link (required)" : "Proof link"} defaultValue={t.evidenceUrl ?? ""} className="h-8 w-44 text-xs" />
                      <Button size="sm" variant="outline" type="submit">Save</Button>
                    </ApiForm>
                    <ApiButton method="DELETE" path={`/tasks/${t.id}`} variant="ghost" size="sm" confirm="Delete this task?"><Trash2 className="h-4 w-4" /></ApiButton>
                  </li>
                );
              })}
              {!list.length && <li className="px-5 py-4 text-sm text-muted">No tasks in this phase.</li>}
            </ul>
          </Card>
        );
      })}
      <Card className="p-5">
        <p className="mb-3 text-sm font-medium">Add a task</p>
        <ApiForm path={`/events/${event.id}/tasks`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]">
          <Input name="title" required placeholder="e.g. Print standees" />
          <Select name="phase" defaultValue="PRE">{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select>
          <Select name="team" defaultValue="OPERATIONS">{WORK_TEAMS.map((t) => <option key={t} value={t}>{WORK_TEAM_LABELS[t]}</option>)}</Select>
          <Input name="dueAt:date" type="datetime-local" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="proofRequired:bool" className="h-4 w-4" />Needs proof link</label>
          <Button type="submit">Add</Button>
        </ApiForm>
      </Card>
    </div>
  );
}
