import { BellRing, Download, ExternalLink, FileText, FolderOpen, Megaphone, Sparkles, Star, Trash2 } from "lucide-react";
import { MEDIA_KINDS, SOCIAL_PLATFORMS } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { fmtDateTime, humanize, isImage } from "@/lib/format";
import type { ElevateEvent, Media, SocialPost } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, StatusBadge, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";
import { HighlightsManager } from "@/components/admin/highlights-manager";
import { MediaUploadPanel } from "@/components/admin/media-upload-panel";

const SOCIAL_STATUSES = ["PLANNED", "DRAFTED", "POSTED"].map((s) => ({ value: s, label: humanize(s) }));

export async function MediaTab({ event }: { event: ElevateEvent }) {
  const [media, social] = await Promise.all([
    apiList<Media>(`/events/${event.id}/media`),
    apiList<SocialPost>(`/events/${event.id}/social`),
  ]);
  const images = media.filter((m) => m.kind !== "PHOTO_ALBUM" && isImage(m))
    .sort((a, b) => Number(!!b.isHighlight) - Number(!!a.isHighlight));
  const files = media.filter((m) => !images.includes(m));
  const posted = social.filter((s) => s.status === "POSTED").length;
  const approved = images.filter((m) => m.approvedForSocial).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Posts on the event page"
          description="LinkedIn, Instagram and YouTube posts, from the team or from participants and guests, shown as live previews under “From the community”."
        />
        <CardBody>
          <HighlightsManager eventId={event.id} items={social.filter((s) => s.featured && s.url).map((s) => ({ id: s.id, platform: s.platform, url: s.url, authorName: s.authorName }))} />
        </CardBody>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Upload photos & files" description="Photos appear in the event page gallery. Highlights show first." />
          <CardBody><MediaUploadPanel eventId={event.id} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Full photo album (Drive folder)" description="For the complete set from the photographer. The social team picks from here." />
          <CardBody className="space-y-3">
            {event.driveFolderUrl ? (
              <a href={event.driveFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-border bg-bg p-3 text-sm hover:border-primary">
                <FolderOpen className="h-5 w-5 text-primary" /><span className="min-w-0 flex-1 truncate">{event.driveFolderUrl}</span><ExternalLink className="h-4 w-4 text-muted" />
              </a>
            ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No Drive folder linked yet. Upload the full set to Drive and paste the shared folder link.</p>}
            <ApiForm method="PUT" path={`/events/${event.id}/drive`} className="flex gap-2" resetOnSuccess={false}>
              <Input name="driveFolderUrl" type="url" required placeholder="https://drive.google.com/drive/folders/…" defaultValue={event.driveFolderUrl ?? ""} />
              <Button type="submit">Save</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Gallery"
          description={`${images.length} images · ${approved} approved for social media`}
          action={(images.length > 0 || event.driveFolderUrl) ? (
            <div className="flex flex-wrap items-center gap-2">
            {images.length > 0 && (
              <a href={`/api/proxy/events/${event.id}/gallery.zip`} className="inline-flex h-8 items-center gap-1.5 rounded-brand px-3 text-sm font-medium text-primary hover:bg-primary/5">
                <Download className="h-4 w-4" />Download all (ZIP)
              </a>
            )}
            <ApiButton path={`/events/${event.id}/gallery/notify`} body={{}} size="sm" variant="secondary" successMessage="Attendees notified"
              confirm="Email and notify everyone who attended that the photos are up?">
              <BellRing className="h-4 w-4" />Notify attendees photos are up
            </ApiButton>
            </div>
          ) : undefined}
        />
        <CardBody>
          {images.length ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((m) => (
                <li key={m.id} className={cn("overflow-hidden rounded-lg border bg-card", m.isHighlight ? "border-accent ring-2 ring-accent/30" : "border-border")}>
                  <a href={m.url} target="_blank" rel="noreferrer" className="relative block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.caption ?? m.title ?? ""} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    <span className="absolute left-2 top-2"><Badge tone="gray" className="bg-white/90">{humanize(m.kind)}</Badge></span>
                  </a>
                  <div className="space-y-2 p-2">
                    <ApiForm method="PATCH" path={`/media/${m.id}`} resetOnSuccess={false} className="flex gap-1">
                      <Input name="caption" defaultValue={m.caption ?? ""} placeholder="Caption" className="h-8 text-xs" aria-label="Caption" />
                      <Button type="submit" size="sm" variant="ghost">Save</Button>
                    </ApiForm>
                    <div className="flex flex-wrap items-center gap-1">
                      <ApiButton method="PATCH" path={`/media/${m.id}`} body={{ isHighlight: !m.isHighlight }} size="sm" variant={m.isHighlight ? "secondary" : "ghost"}>
                        <Star className={cn("h-3.5 w-3.5", m.isHighlight && "fill-current")} />{m.isHighlight ? "Highlight" : "Highlight?"}
                      </ApiButton>
                      <ApiButton method="PATCH" path={`/media/${m.id}`} body={{ approvedForSocial: !m.approvedForSocial }} size="sm" variant={m.approvedForSocial ? "secondary" : "ghost"}>
                        <Megaphone className="h-3.5 w-3.5" />{m.approvedForSocial ? "For social" : "Social?"}
                      </ApiButton>
                      <ApiButton method="DELETE" path={`/media/${m.id}`} variant="ghost" size="sm" confirm="Delete this photo?"><Trash2 className="h-3.5 w-3.5" /></ApiButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No photos yet" description="Upload key photos above. Mark the best as highlights for the event page and approve the ones the social team may post." />}
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title="Files & links" description="Posters, decks, videos, reports, external links" />
          <ul className="divide-y divide-border">
            {files.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted" />
                <Badge tone="primary">{humanize(m.kind)}</Badge>
                <a href={m.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-primary">{m.caption || m.title || m.url}</a>
                <ApiButton method="DELETE" path={`/media/${m.id}`} variant="ghost" size="sm" confirm="Remove this item?"><Trash2 className="h-4 w-4" /></ApiButton>
              </li>
            ))}
            {!files.length && <li className="px-5 py-4 text-sm text-muted">Nothing added yet.</li>}
          </ul>
          <CardBody className="border-t border-border">
            <ApiForm path={`/events/${event.id}/media`} className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
              <Select name="kind" defaultValue="VIDEO" aria-label="Kind">{MEDIA_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select>
              <Input name="title" placeholder="Title" aria-label="Title" />
              <Input name="url" type="url" required placeholder="https://…" aria-label="Link" />
              <Button type="submit">Add link</Button>
            </ApiForm>
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Social media tracker"
            description={`${posted}/${social.length} posts live`}
            action={<ApiButton path={`/events/${event.id}/social/suggest`} body={{}} size="sm" variant="secondary" successMessage="Captions drafted"><Sparkles className="h-4 w-4" />Suggest captions</ApiButton>}
          />
          {social.length ? (
            <ul className="divide-y divide-border">
              {social.map((s) => (
                <li key={s.id} className="space-y-2 px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{humanize(s.platform)}</Badge><StatusBadge status={s.status} />
                      {s.generatedBy && <Badge tone="purple"><Sparkles className="h-3 w-3" />{s.generatedBy === "ai" ? "AI draft" : "Template"}</Badge>}
                      {s.postedAt && <span className="text-xs text-muted">{fmtDateTime(s.postedAt)}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <ApiSelect path={`/social/${s.id}`} field="status" value={s.status} options={SOCIAL_STATUSES} className="w-28" />
                      <ApiButton method="DELETE" path={`/social/${s.id}`} variant="ghost" size="sm" confirm="Remove this post?"><Trash2 className="h-4 w-4" /></ApiButton>
                    </div>
                  </div>
                  <ApiForm method="PATCH" path={`/social/${s.id}`} className="space-y-2" resetOnSuccess={false} successMessage="Caption saved">
                    <Textarea name="caption" defaultValue={s.caption ?? ""} rows={4} placeholder="Caption" aria-label={`${s.platform} caption`} className="text-sm" />
                    <Button size="sm" variant="ghost" type="submit">Save caption</Button>
                  </ApiForm>
                  {s.status !== "POSTED" && (
                    <ApiForm method="PATCH" path={`/social/${s.id}`} className="flex gap-2" resetOnSuccess={false} extra={{ status: "POSTED" }}>
                      <Input name="url" type="url" required placeholder="Post link" defaultValue={s.url ?? ""} className="h-8 text-xs" aria-label="Post link" />
                      <Button size="sm" variant="outline" type="submit">Mark posted</Button>
                    </ApiForm>
                  )}
                  {s.status === "POSTED" && s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View post ↗</a>}
                </li>
              ))}
            </ul>
          ) : <CardBody><EmptyState title="No social posts yet" description="Press Suggest captions to draft a post for each platform from the event's highlights, guests and results." /></CardBody>}
          <CardBody className="border-t border-border">
            <ApiForm path={`/events/${event.id}/social`} className="space-y-2">
              <Select name="platform" defaultValue="INSTAGRAM" aria-label="Platform">{SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select>
              <Textarea name="caption" placeholder="Caption / brief for the social team" aria-label="Caption" />
              <Button type="submit" variant="outline">Plan a post</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
