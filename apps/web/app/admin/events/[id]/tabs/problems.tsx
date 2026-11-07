import { apiList } from "@/lib/api";
import type { ElevateEvent, ProblemStatement } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { ProblemStatementsManager } from "@/components/admin/problem-statements-manager";

export async function ProblemsTab({ event }: { event: ElevateEvent }) {
  const items = await apiList<ProblemStatement>(`/events/${event.id}/problem-statements`);
  const hidden = items.filter((p) => p.releaseAt && new Date(p.releaseAt).getTime() > Date.now()).length;
  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader
          title="Problem statements"
          description={`${items.length} statement${items.length === 1 ? "" : "s"}${hidden ? ` · ${hidden} hidden until release` : ""}. Teams pick one when registering or on their team page. Use “Hidden until” to reveal them at kickoff.`}
        />
        <CardBody><ProblemStatementsManager eventId={event.id} items={items} tracks={event.config?.tracks ?? []} /></CardBody>
      </Card>
    </div>
  );
}
