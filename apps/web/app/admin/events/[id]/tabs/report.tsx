import { CheckCircle2, Circle, ExternalLink, MinusCircle } from "lucide-react";
import { WORK_TEAMS, WORK_TEAM_LABELS, type WorkTeam } from "@elevate/shared";
import { apiGet, apiList } from "@/lib/api";
import { eventLabel, fmtDate, fmtRange, humanize } from "@/lib/format";
import type { ElevateEvent, Task, Tenant } from "@/lib/types";
import { KeyValue, numericLeaves } from "@/components/kv";
import { BrandLogo } from "@/components/brand-logo";
import { Card, EmptyState, Stat } from "@/components/ui";
import { PrintButton } from "@/components/client/misc";

export async function ReportTab({ event, tenant }: { event: ElevateEvent; tenant: Tenant }) {
  const [fresh, tasks] = await Promise.all([apiGet<Record<string, unknown>>(`/events/${event.id}/outcome`), apiList<Task>(`/events/${event.id}/tasks`)]);
  const outcome = fresh ?? event.outcome ?? null;
  if (!outcome) return <EmptyState title="Report not available" description="The outcome report is built from registrations, attendance, judging, media and posts. Try again once the event has data." />;
  const headline = numericLeaves(outcome).slice(0, 8);
  const sections = Object.entries(outcome).filter(([, v]) => v !== null && typeof v === "object");
  const scalars = Object.fromEntries(Object.entries(outcome).filter(([, v]) => v === null || typeof v !== "object"));

  return (
    <div className="space-y-6">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <Card className="p-8 print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Event outcome report</p>
            <h2 className="mt-1 text-2xl font-bold">{event.title}</h2>
            <p className="text-sm text-muted">{eventLabel(event)} · {humanize(event.mode)} · {fmtRange(event.startsAt, event.endsAt)}</p>
            {event.owner && <p className="text-sm text-muted">Owner: <span className="font-medium text-fg">{event.owner.name}</span></p>}
          </div>
          <BrandLogo tenant={tenant} size={40} />
        </div>
        {headline.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {headline.map((h) => <Stat key={h.label} label={h.label} value={Number.isInteger(h.value) ? h.value : h.value.toFixed(1)} />)}
          </div>
        )}
        {Object.keys(scalars).length > 0 && <div className="mt-6"><KeyValue data={scalars} /></div>}
        {sections.map(([k, v]) => (
          <section key={k} className="mt-8 break-inside-avoid">
            <h3 className="mb-2 text-lg font-semibold">{humanize(k)}</h3>
            <KeyValue data={v} />
          </section>
        ))}
        {tasks.length > 0 && <WhoDidWhat tasks={tasks} />}
        <p className="mt-10 text-xs text-muted">{tenant.name} · report generated {new Date().toLocaleDateString("en-IN")}</p>
      </Card>
    </div>
  );
}

/** Every checklist task by team: done or not, who did it, when, and the proof link (e.g. the Instagram post). */
function WhoDidWhat({ tasks }: { tasks: Task[] }) {
  const proofs = tasks.filter((t) => t.evidenceUrl);
  return (
    <section className="mt-8 break-inside-avoid">
      <h3 className="mb-1 text-lg font-semibold">Who did what</h3>
      <p className="mb-4 text-sm text-muted">
        {tasks.filter((t) => t.status === "DONE").length} of {tasks.length} checklist tasks done
        {proofs.length ? ` · ${proofs.length} with proof links` : ""}
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        {WORK_TEAMS.map((team) => {
          const list = tasks.filter((t) => (t.team ?? "OWNER") === team);
          if (!list.length) return null;
          return (
            <div key={team}>
              <p className="mb-2 text-sm font-semibold">{WORK_TEAM_LABELS[team as WorkTeam]}</p>
              <ul className="space-y-2 text-sm">
                {list.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    {t.status === "DONE" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      : t.status === "SKIPPED" ? <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                    <div className="min-w-0">
                      <p className={t.status === "SKIPPED" ? "text-muted line-through" : ""}>{t.title}</p>
                      <p className="text-xs text-muted">
                        {t.status === "DONE" ? "Done" : t.status === "SKIPPED" ? "Skipped" : `Not done (due ${fmtDate(t.dueAt)})`}
                        {t.assignee ? ` · ${t.assignee.name}` : ""}
                        {t.evidenceUrl && <> · <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">proof <ExternalLink className="h-3 w-3" /></a></>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
