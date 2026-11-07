import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import { WORK_TEAM_LABELS, type WorkTeam } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { Task } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, Tabs } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";

export const metadata: Metadata = { title: "My tasks" };

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));
const TEAM_TONE: Record<WorkTeam, "primary" | "blue" | "purple"> = { OWNER: "primary", OPERATIONS: "blue", SOCIAL_MEDIA: "purple" };

/** Everything assigned to me or my teams (Operations, Social media), across every event. */
export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const all = tab === "all";
  const [tasks, me] = await Promise.all([apiList<Task>(`/me/tasks?scope=${all ? "all" : "open"}`), getMe()]);
  const teams = (me?.membership?.teams ?? []).map((t) => WORK_TEAM_LABELS[t as WorkTeam] ?? t);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My tasks</h1>
        <p className="text-sm text-muted">
          Tasks assigned to you{teams.length ? ` and to your team${teams.length > 1 ? "s" : ""} (${teams.join(", ")})` : ""}, across all events.
          Posts need the post link as proof before they can be marked done.
        </p>
      </div>
      <Tabs tabs={[{ key: "open", label: "To do" }, { key: "all", label: "All, including done" }]} active={all ? "all" : "open"} baseHref="/admin/tasks" />
      <Card>
        {tasks.length ? (
          <ul className="divide-y divide-border">
            {tasks.map((t) => {
              const done = t.status === "DONE" || t.status === "SKIPPED";
              const overdue = !done && t.dueAt && new Date(t.dueAt) < now;
              const team = (t.team ?? "OWNER") as WorkTeam;
              const needsProof = t.proofRequired && !t.evidenceUrl && t.status !== "SKIPPED";
              return (
                <li key={t.id} className="grid items-center gap-3 px-5 py-4 lg:grid-cols-[1fr_auto_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={TEAM_TONE[team]}>{WORK_TEAM_LABELS[team]}</Badge>
                      {t.proofRequired && <Badge tone={needsProof ? "amber" : "green"}><Link2 className="h-3 w-3" />{needsProof ? "Proof link needed" : "Proof added"}</Badge>}
                      {t.event && <Link href={`/admin/events/${t.event.id}?tab=checklist`} className="text-xs font-medium text-primary hover:underline">{t.event.title}</Link>}
                    </div>
                    <p className={cn("mt-1 text-sm font-medium", t.status === "DONE" && "text-muted line-through")}>{t.title}</p>
                    <p className={cn("text-xs", overdue ? "font-medium text-red-600" : "text-muted")}>
                      Due {fmtDate(t.dueAt)}{overdue ? " · overdue" : ""} · {t.assignee ? `Assigned to ${t.assignee.name}` : `${WORK_TEAM_LABELS[team]} team`}
                      {t.evidenceUrl && <> · <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">proof <ExternalLink className="h-3 w-3" /></a></>}
                    </p>
                  </div>
                  <ApiForm method="PATCH" path={`/tasks/${t.id}`} className="flex gap-1" resetOnSuccess={false} successMessage="Saved">
                    <Input name="evidenceUrl" type="url" placeholder={t.proofRequired ? "Post link (required)" : "Proof link (optional)"} defaultValue={t.evidenceUrl ?? ""} className="h-8 w-56 text-xs" />
                    <Button size="sm" variant="outline" type="submit">Save</Button>
                  </ApiForm>
                  <ApiSelect path={`/tasks/${t.id}`} field="status" value={t.status} options={STATUSES} className="w-32" />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState
              title={all ? "No tasks yet" : "Nothing to do right now"}
              description={teams.length ? "New tasks appear here when events are created." : "Ask an admin to add you to a team (Operations or Social media) in Brand settings → Team & roles."}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
