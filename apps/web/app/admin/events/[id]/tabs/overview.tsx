import { Check } from "lucide-react";
import { EVENT_STATUS_FLOW, EVENT_STATUSES } from "@elevate/shared";
import { apiGet, apiList } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";
import type { Activity, ElevateEvent, Task } from "@/lib/types";
import { StatGrid } from "@/components/kv";
import { Card, CardBody, CardHeader, Progress, Stat } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { ApiButton } from "@/components/client/api-button";
import { ApiSelect } from "@/components/client/api-select";

const NEXT_HINT: Partial<Record<string, string>> = {
  REGISTRATION_OPEN: "Opens registration on the public page",
  COMPLETED: "Queues certificates and LinkedIn post drafts automatically",
  JUDGING: "Judges can start scoring on the mobile app",
};

export async function OverviewTab({ event }: { event: ElevateEvent }) {
  const [dash, tasks, activity] = await Promise.all([
    apiGet<Record<string, unknown>>(`/events/${event.id}/dashboard`),
    apiList<Task>(`/events/${event.id}/tasks`),
    apiList<Activity>(`/events/${event.id}/activity`),
  ]);
  const flow = EVENT_STATUS_FLOW as readonly string[];
  const idx = flow.indexOf(event.status);
  const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  const cancelled = event.status === "CANCELLED";
  const phases = (["PRE", "DURING", "POST"] as const).map((p) => {
    const list = tasks.filter((t) => t.phase === p);
    const done = list.filter((t) => t.status === "DONE" || t.status === "SKIPPED").length;
    return { phase: p, total: list.length, done };
  });
  const overdue = tasks.filter((t) => t.dueAt && new Date(t.dueAt) < new Date() && !["DONE", "SKIPPED"].includes(t.status)).length;
  const recent = (activity.length ? activity : ((dash?.recentActivity ?? dash?.activity ?? []) as Activity[])).slice(0, 25);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Lifecycle"
          description={next && !cancelled ? NEXT_HINT[next] : undefined}
          action={
            <div className="flex flex-wrap items-start gap-2">
              {next && !cancelled && <ApiButton path={`/events/${event.id}/status`} body={{ status: next }} size="sm">Move to {humanize(next)}</ApiButton>}
              <ApiSelect
                path={`/events/${event.id}/status`}
                method="POST"
                field="status"
                value={event.status}
                options={EVENT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
                className="w-44"
              />
            </div>
          }
        />
        <CardBody>
          <ol className="flex items-center overflow-x-auto pb-2">
            {flow.map((s, i) => {
              const done = !cancelled && i < idx;
              const current = s === event.status;
              return (
                <li key={s} className="flex shrink-0 items-center">
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold",
                      done && "border-primary bg-primary text-primary-fg",
                      current && "border-primary bg-primary/10 text-primary",
                      !done && !current && "border-border text-muted",
                    )}>{done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                    <span className={cn("w-20 text-center text-[11px] leading-tight", current ? "font-semibold text-fg" : "text-muted")}>{humanize(s)}</span>
                  </div>
                  {i < flow.length - 1 && <span className={cn("mb-5 h-0.5 w-6", done ? "bg-primary" : "bg-border")} />}
                </li>
              );
            })}
          </ol>
          {cancelled && <p className="mt-2 text-sm font-medium text-red-600">This event was cancelled.</p>}
          {!cancelled && event.status !== "ARCHIVED" && (
            <div className="mt-3"><ApiButton path={`/events/${event.id}/status`} body={{ status: "CANCELLED" }} variant="ghost" size="sm" confirm="Cancel this event? Participants will see it as cancelled.">Cancel event</ApiButton></div>
          )}
        </CardBody>
      </Card>

      {dash ? <StatGrid data={dash} skip={["tasks", "event", "activity", "recentActivity", "id"]} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(event._count ?? event.counts ?? {}).map(([k, v]) => <Stat key={k} label={humanize(k)} value={v} />)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Checklist progress" description={overdue ? `${overdue} overdue task${overdue > 1 ? "s" : ""}` : "Nothing overdue"} />
          <CardBody className="space-y-4">
            {phases.map((p) => (
              <div key={p.phase}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{p.phase === "PRE" ? "Before event" : p.phase === "DURING" ? "During event" : "After event"}</span><span className="tabular-nums text-muted">{p.done}/{p.total}</span></div>
                <Progress value={p.total ? (p.done / p.total) * 100 : 0} />
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Activity" description="Everything that happened on this event" />
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {recent.length ? recent.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <p><span className="font-medium">{a.actor?.name ?? "System"}</span> <span className="text-muted">{describe(a)}</span></p>
                <p className="text-xs text-muted">{fmtDateTime(a.createdAt)}</p>
              </li>
            )) : <li className="px-5 py-8 text-center text-sm text-muted">No activity yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function describe(a: Activity): string {
  const d = a.data ?? {};
  const extra = (d.to ?? d.status ?? d.title ?? d.name ?? "") as string;
  return `${humanize(a.action.replace(/\./g, " "))}${extra ? ` — ${typeof extra === "string" ? humanize(extra) : String(extra)}` : ""}`;
}
