import { ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { MEDIA_KINDS, SOCIAL_PLATFORMS } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { fmtDateTime, humanize } from "@/lib/format";
import type { ElevateEvent, Media, SocialPost } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, StatusBadge, Textarea } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";

const SOCIAL_STATUSES = ["PLANNED", "DRAFTED", "POSTED"].map((s) => ({ value: s, label: humanize(s) }));

export async function MediaTab({ event }: { event: ElevateEvent }) {
  const [media, social] = await Promise.all([
    apiList<Media>(`/events/${event.id}/media`),
    apiList<SocialPost>(`/events/${event.id}/social`),
  ]);
  const posted = social.filter((s) => s.status === "POSTED").length;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Photo album (Drive folder)" description="The social media team picks photos from here" />
          <CardBody className="space-y-3">
            {event.driveFolderUrl ? (
              <a href={event.driveFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-border bg-bg p-3 text-sm hover:border-primary">
                <FolderOpen className="h-5 w-5 text-primary" /><span className="min-w-0 flex-1 truncate">{event.driveFolderUrl}</span><ExternalLink className="h-4 w-4 text-muted" />
              </a>
            ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No Drive folder linked yet. Upload photos to Drive and paste the shared folder link.</p>}
            <ApiForm method="PUT" path={`/events/${event.id}/drive`} className="flex gap-2">
              <Input name="driveFolderUrl" type="url" required placeholder="https://drive.google.com/drive/folders/…" defaultValue={event.driveFolderUrl ?? ""} />
              <Button type="submit">Save</Button>
            </ApiForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Media library" description="Posters, key photos, guest photos, videos, decks" />
          <ul className="divide-y divide-border">
            {media.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Badge tone="primary">{humanize(m.kind)}</Badge>
                <a href={m.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-primary">{m.title || m.url}</a>
                <ApiButton method="DELETE" path={`/media/${m.id}`} variant="ghost" size="sm" confirm="Remove this item?"><Trash2 className="h-4 w-4" /></ApiButton>
              </li>
            ))}
            {!media.length && <li className="px-5 py-4 text-sm text-muted">Nothing added yet.</li>}
          </ul>
          <CardBody className="border-t border-border">
            <ApiForm path={`/events/${event.id}/media`} className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
              <Select name="kind" defaultValue="PHOTO">{MEDIA_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select>
              <Input name="title" placeholder="Title" />
              <Input name="url" type="url" required placeholder="https://…" />
              <Button type="submit">Add</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Social media tracker" description={`${posted}/${social.length} posts live`} />
        {social.length ? (
          <ul className="divide-y divide-border">
            {social.map((s) => (
              <li key={s.id} className="space-y-2 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Badge tone="blue">{humanize(s.platform)}</Badge><StatusBadge status={s.status} />{s.postedAt && <span className="text-xs text-muted">{fmtDateTime(s.postedAt)}</span>}</div>
                  <ApiSelect path={`/social/${s.id}`} field="status" value={s.status} options={SOCIAL_STATUSES} className="w-28" />
                </div>
                {s.caption && <p className="line-clamp-2 text-sm text-fg/80">{s.caption}</p>}
                <ApiForm method="PATCH" path={`/social/${s.id}`} className="flex gap-2" resetOnSuccess={false} extra={{ status: "POSTED" }}>
                  <Input name="url" type="url" required placeholder="Post link" defaultValue={s.url ?? ""} className="h-8 text-xs" />
                  <Button size="sm" variant="outline" type="submit">Mark posted</Button>
                </ApiForm>
              </li>
            ))}
          </ul>
        ) : <CardBody><EmptyState title="No social posts planned" description="Plan a post for each platform to track what's done." /></CardBody>}
        <CardBody className="border-t border-border">
          <ApiForm path={`/events/${event.id}/social`} className="space-y-2">
            <Select name="platform" defaultValue="LINKEDIN">{SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select>
            <Textarea name="caption" placeholder="Caption / brief for the social team" />
            <Button type="submit">Plan post</Button>
          </ApiForm>
        </CardBody>
      </Card>
    </div>
  );
}
