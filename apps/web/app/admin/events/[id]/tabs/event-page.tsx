import { CheckCircle2, Circle, ExternalLink, Trash2 } from "lucide-react";
import { SPONSOR_TIERS } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { getOrigin } from "@/lib/tenant";
import { humanize } from "@/lib/format";
import type { ElevateEvent, Guest, Sponsor } from "@/lib/types";
import { Button, Card, CardBody, CardHeader, Field, FieldGroup, Input, LinkButton, Select } from "@/components/ui";
import { RichTextEditor } from "@/components/client/rich-text-editor";
import { PageSectionsEditor } from "@/components/admin/page-sections-editor";
import { htmlToText } from "@/components/rich-text";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { ApiSelect } from "@/components/client/api-select";
import { CopyButton } from "@/components/client/misc";
import { UploadField } from "@/components/client/uploader";
import { FaqEditor } from "@/components/admin/faq-editor";

const TIER_OPTIONS = SPONSOR_TIERS.map((t) => ({ value: t, label: humanize(t) }));

export async function EventPageTab({ event }: { event: ElevateEvent }) {
  const [sponsors, guests, origin] = await Promise.all([
    event.sponsors ? Promise.resolve(event.sponsors) : apiList<Sponsor>(`/events/${event.id}/sponsors`),
    apiList<Guest>(`/events/${event.id}/guests`),
    getOrigin(),
  ]);
  const isPublic = !["DRAFT", "PLANNING"].includes(event.status);
  const publicUrl = `${origin}/events/${event.slug}`;
  const previewUrl = event.previewToken ? `${publicUrl}?preview=${event.previewToken}` : null;
  const checks: [string, boolean][] = [
    ["Cover image", !!event.coverImageUrl],
    ["Description", htmlToText(event.description).length > 80],
    ...(event.modules?.teams ? [["Page sections (rules, prizes, timeline)", (event.pageSections?.length ?? 0) >= 2] as [string, boolean]] : []),
    ["Date, venue or meeting link", !!(event.venue || event.meetingUrl)],
    ...(event.modules?.guests ? [["Guests with photo and bio", guests.length > 0 && guests.every((g) => g.photoUrl && g.bio)] as [string, boolean]] : []),
    ...(event.modules?.sponsors ? [["Sponsors", sponsors.length > 0] as [string, boolean]] : []),
    ["FAQs", (event.faqs?.length ?? 0) > 0],
    ["Contact for questions", !!(event.contactEmail || event.contactPhone)],
  ];
  const done = checks.filter(([, ok]) => ok).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Public event page"
            description={isPublic ? "Live on your brand site. Created automatically from this event." : "Created automatically. It goes public when the event is Announced; until then share the preview link."}
          />
          <CardBody className="space-y-3">
            <LinkRow label="Public link" url={publicUrl} live={isPublic} />
            {previewUrl && !isPublic && <LinkRow label="Preview link (private)" url={previewUrl} live />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="About this event" description="The main description on the public page. Headings, lists, links, images and tables are supported." />
          <CardBody>
            <ApiForm method="PATCH" path={`/events/${event.id}`} resetOnSuccess={false} successMessage="Description saved." className="space-y-3">
              <RichTextEditor name="description" defaultValue={event.description} eventId={event.id} placeholder="What is this event about? Who should come and why?" minHeight="14rem" ai={{ kind: "description", eventId: event.id }} />
              <Button type="submit">Save description</Button>
            </ApiForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Page sections" description="Eligibility, timeline, prizes, rules… Each section gets its own heading and a link in the page's section menu." />
          <CardBody><PageSectionsEditor eventId={event.id} eventType={event.type} initial={Array.isArray(event.pageSections) ? event.pageSections : []} /></CardBody>
        </Card>

        <Card>
          <CardHeader title="Page details" />
          <CardBody>
            <ApiForm method="PATCH" path={`/events/${event.id}`} resetOnSuccess={false} successMessage="Page details saved." className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Cover image" className="sm:col-span-2" hint="Shown at the top of the page and when the link is shared."><UploadField name="coverImageUrl" defaultValue={event.coverImageUrl} fields={{ eventId: event.id, kind: "POSTER" }} /></FieldGroup>
              <Field label="Livestream link"><Input name="livestreamUrl" type="url" defaultValue={event.livestreamUrl ?? ""} placeholder="https://youtube.com/live/…" /></Field>
              <Field label="Venue map link"><Input name="venueMapUrl" type="url" defaultValue={event.venueMapUrl ?? ""} placeholder="https://maps.google.com/…" /></Field>
              <Field label="Contact email"><Input name="contactEmail" type="email" defaultValue={event.contactEmail ?? ""} /></Field>
              <Field label="Contact phone"><Input name="contactPhone" defaultValue={event.contactPhone ?? ""} /></Field>
              <div className="sm:col-span-2"><Button type="submit">Save page details</Button></div>
            </ApiForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="FAQs" description="Answer common questions before students ask them." />
          <CardBody><FaqEditor eventId={event.id} faqs={event.faqs ?? []} /></CardBody>
        </Card>

        <Card>
          <CardHeader title="Sponsors & partners" description="Grouped by tier on the public page" />
          <ul className="divide-y divide-border">
            {sponsors.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-10 w-20 shrink-0 items-center justify-center rounded border border-border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.logoUrl ? <img src={s.logoUrl} alt="" className="max-h-8 max-w-[72px] object-contain" /> : <span className="text-[10px] text-muted">No logo</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">{s.website}</a>}
                </div>
                <ApiSelect path={`/sponsors/${s.id}`} field="tier" value={s.tier ?? "PARTNER"} options={TIER_OPTIONS} className="w-28" />
                <ApiButton method="DELETE" path={`/sponsors/${s.id}`} variant="ghost" size="sm" confirm={`Remove ${s.name}?`}><Trash2 className="h-4 w-4" /></ApiButton>
              </li>
            ))}
            {!sponsors.length && <li className="px-5 py-4 text-sm text-muted">No sponsors yet.</li>}
          </ul>
          <CardBody className="border-t border-border">
            <ApiForm path={`/events/${event.id}/sponsors`} className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Tier"><Select name="tier" defaultValue="PARTNER">{SPONSOR_TIERS.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
              <Field label="Website"><Input name="website" type="url" /></Field>
              <FieldGroup label="Logo"><UploadField name="logoUrl" fields={{ eventId: event.id }} /></FieldGroup>
              <div className="sm:col-span-2"><Button type="submit">Add sponsor</Button></div>
            </ApiForm>
          </CardBody>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Page readiness" description={`${done} of ${checks.length} done`} />
        <CardBody>
          <ul className="space-y-2 text-sm">
            {checks.map(([label, ok]) => (
              <li key={label} className="flex items-center gap-2">
                {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted" />}
                <span className={ok ? "" : "text-muted"}>{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Agenda, speakers, problem statements, judging parameters, gallery and winners appear on the page automatically as you add them.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function LinkRow({ label, url, live }: { label: string; url: string; live: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className={`truncate font-mono text-sm ${live ? "" : "text-muted"}`}>{url}</p>
      </div>
      <CopyButton text={url} />
      <LinkButton href={url} external size="sm" variant="outline">Open <ExternalLink className="h-3.5 w-3.5" /></LinkButton>
    </div>
  );
}
