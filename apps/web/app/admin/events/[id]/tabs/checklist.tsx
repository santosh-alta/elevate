import { ExternalLink, Trash2 } from "lucide-react";
import { apiList } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { ElevateEvent, Membership, Task } from "@/lib/types";
import { Button, Card, CardHeader, Input, Progress, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";

const PHASES = [
  { key: "PRE", label: "Before the event" },
  { key: "DURING", label: "During the event" },
  { key: "POST", label: "After the event" },
] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));

export async function ChecklistTab({ event }: { event: ElevateEvent }) {
  const [tasks, members] = await Promise.all([
    apiList<Task>(`/events/${event.id}/tasks`),
    apiList<Membership>("/admin/members"),
  ]);
  const staff = members.filter((m) => m.user && m.role !== "STUDENT");
  const people = staff.map((m) => ({ value: m.user!.id, label: m.user!.name }));
  // Ensure current assignees appear even if not in the member list.
  for (const t of tasks) if (t.assignee && !people.some((p) => p.value === t.assignee!.id)) people.push({ value: t.assignee.id, label: t.assignee.name });
  const now = new Date();

  return (
    <div className="space-y-6">
      {PHASES.map(({ key, label }) => {
        const list = tasks.filter((t) => t.phase === key);
        const done = list.filter((t) => t.status === "DONE" || t.status === "SKIPPED").length;
        return (
          <Card key={key}>
            <CardHeader title={label} action={<div className="flex w-40 items-center gap-2"><Progress value={list.length ? (done / list.length) * 100 : 0} /><span className="text-xs tabular-nums text-muted">{done}/{list.length}</span></div>} />
            <ul className="divide-y divide-border">
              {list.map((t) => {
                const overdue = t.dueAt && new Date(t.dueAt) < now && !["DONE", "SKIPPED"].includes(t.status);
                return (
                  <li key={t.id} className="grid items-center gap-3 px-5 py-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium", t.status === "DONE" && "text-muted line-through")}>{t.title}</p>
                      <p className={cn("text-xs", overdue ? "font-medium text-red-600" : "text-muted")}>
                        Due {fmtDate(t.dueAt)}{overdue ? " · overdue" : ""}
                        {t.evidenceUrl && <> · <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">evidence <ExternalLink className="h-3 w-3" /></a></>}
                      </p>
                    </div>
                    <ApiSelect path={`/tasks/${t.id}`} field="status" value={t.status} options={STATUSES} className="w-32" />
                    <ApiSelect path={`/tasks/${t.id}`} field="assigneeId" value={t.assigneeId} options={people} placeholder="Unassigned" className="w-40" />
                    <ApiForm method="PATCH" path={`/tasks/${t.id}`} className="flex gap-1" resetOnSuccess={false}>
                      <Input name="evidenceUrl" type="url" placeholder="Evidence link" defaultValue={t.evidenceUrl ?? ""} className="h-8 w-40 text-xs" />
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
        <ApiForm path={`/events/${event.id}/tasks`} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input name="title" required placeholder="e.g. Print standees" />
          <Select name="phase" defaultValue="PRE">{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select>
          <Input name="dueAt:date" type="datetime-local" />
          <Button type="submit">Add</Button>
        </ApiForm>
      </Card>
    </div>
  );
}
