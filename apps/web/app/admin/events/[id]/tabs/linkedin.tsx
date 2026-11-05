import { ExternalLink } from "lucide-react";
import { apiList } from "@/lib/api";
import type { ElevateEvent, LinkedInPost } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, Progress, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";

export async function LinkedInTab({ event }: { event: ElevateEvent }) {
  const posts = await apiList<LinkedInPost>(`/events/${event.id}/linkedin`);
  const posted = posts.filter((p) => p.status === "POSTED").length;
  const pct = posts.length ? Math.round((posted / posts.length) * 100) : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Drafts sent" value={posts.length} />
        <Stat label="Posted" value={posted} />
        <Stat label="Posting rate" value={`${pct}%`} />
        <Stat label="Skipped" value={posts.filter((p) => p.status === "SKIPPED").length} />
      </div>
      <Card>
        <CardHeader
          title="LinkedIn post suggestions"
          description="Every participant gets a personalised draft in the app. When they paste their post link we track it here."
          action={<ApiButton path={`/events/${event.id}/linkedin/generate`} successMessage="Drafts generated.">Generate drafts</ApiButton>}
        />
        {posts.length > 0 && <div className="px-5 pt-4"><Progress value={pct} /></div>}
        {posts.length ? (
          <Table className="mt-2">
            <thead><tr><Th>Participant</Th><Th>Draft</Th><Th>Status</Th><Th>Post</Th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap font-medium">{p.user?.name ?? "—"}{p.generatedBy === "ai" && <Badge tone="purple" className="ml-2">AI</Badge>}</Td>
                  <Td className="max-w-md"><p className="line-clamp-2 text-xs text-muted">{p.draft}</p></Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td>{p.postUrl ? <a href={p.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">View <ExternalLink className="h-3 w-3" /></a> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No drafts yet" description="Drafts are generated automatically when the event is completed." /></div>}
      </Card>
    </div>
  );
}
