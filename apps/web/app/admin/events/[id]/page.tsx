import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { eventCampuses, eventLabel, fmtRange } from "@/lib/format";
import { getEventTypes, getTags } from "@/lib/catalog";
import type { ElevateEvent, Payment } from "@/lib/types";
import { Badge, StatusBadge, Tabs } from "@/components/ui";
import { ModeBadge } from "@/components/event-card";
import { OverviewTab } from "./tabs/overview";
import { ChecklistTab } from "./tabs/checklist";
import { GuestsTab } from "./tabs/guests";
import { RegistrationsTab } from "./tabs/registrations";
import { JudgingTab } from "./tabs/judging";
import { MediaTab } from "./tabs/media";
import { CertificatesTab } from "./tabs/certificates";
import { LinkedInTab } from "./tabs/linkedin";
import { ReportTab } from "./tabs/report";
import { EventForm } from "../event-form";
import { EventPageTab } from "./tabs/event-page";
import { NotificationsTab } from "./tabs/notifications";
import { ProblemsTab } from "./tabs/problems";
import { PaymentsTab } from "./tabs/payments";
import { CloneEventButton } from "@/components/admin/clone-event-button";
import { ApprovalPanel } from "@/components/admin/approval-panel";
import { getMe, isBrandAdmin, isReviewer } from "@/lib/auth";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; guest?: string; round?: string; status?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = await apiGet<ElevateEvent>(`/events/${id}`);
  return { title: e?.title ?? "Event" };
}

export default async function EventCommandCentre({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "overview", guest, round, status } = await searchParams;
  const event = await apiGet<ElevateEvent>(`/events/${id}`);
  if (!event) notFound();
  const [tenant, me] = await Promise.all([requireTenant(), getMe()]);
  const m = event.modules ?? {};
  // Payments tab: when the event charges a fee, or has any payments recorded (e.g. fee removed later).
  const hasPayments = !!event.feeAmount || !!event.fee || (await apiList<Payment>(`/events/${event.id}/payments`)).length > 0;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "checklist", label: "Checklist" },
    { key: "page", label: "Event page" },
    ...(m.guests ? [{ key: "guests", label: "Guests" }] : []),
    { key: "registrations", label: "Registrations" },
    ...(hasPayments ? [{ key: "payments", label: "Payments" }] : []),
    ...(m.teams || m.submissions ? [{ key: "problems", label: "Problem statements" }] : []),
    ...(m.teams || m.judging ? [{ key: "judging", label: "Teams & judging" }] : []),
    { key: "media", label: "Media & social" },
    ...(m.certificates !== false ? [{ key: "certificates", label: "Certificates" }] : []),
    { key: "linkedin", label: "LinkedIn" },
    { key: "notifications", label: "Communications" },
    { key: "report", label: "Outcome report" },
    { key: "details", label: "Edit details" },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "overview";
  const campuses = eventCampuses(event);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/admin/events" className="text-sm text-muted hover:text-fg">← Events</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={event.status} />
              <Badge tone="primary">{eventLabel(event)}</Badge>
              <ModeBadge mode={event.mode} />
              <Badge>{event.scope === "CENTRAL" ? "Central" : campuses.map((c) => c.name).join(", ") || "Campus"}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
            <p className="text-sm text-muted">{fmtRange(event.startsAt, event.endsAt)}{event.venue ? ` · ${event.venue}` : ""}</p>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <Link
              href={`/events/${event.slug}${["DRAFT", "PLANNING"].includes(event.status) && event.previewToken ? `?preview=${event.previewToken}` : ""}`}
              target="_blank"
              className="inline-flex h-8 items-center gap-1 rounded-brand px-3 text-sm font-medium text-primary hover:bg-primary/5"
            >
              {["DRAFT", "PLANNING"].includes(event.status) ? "Preview page" : "Public page"} <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <CloneEventButton eventId={event.id} title={event.title} startsAt={event.startsAt} endsAt={event.endsAt} />
          </div>
        </div>
        <div className="mt-5"><ApprovalPanel event={event} reviewer={isReviewer(me)} admin={isBrandAdmin(me)} /></div>
        <div className="mt-5"><Tabs tabs={tabs} active={active} baseHref={`/admin/events/${event.id}`} /></div>
      </div>

      {active === "overview" && <OverviewTab event={event} />}
      {active === "checklist" && <ChecklistTab event={event} />}
      {active === "guests" && <GuestsTab event={event} guestId={guest} />}
      {active === "page" && <EventPageTab event={event} />}
      {active === "notifications" && <NotificationsTab event={event} />}
      {active === "registrations" && <RegistrationsTab event={event} />}
      {active === "judging" && <JudgingTab event={event} roundId={round} />}
      {active === "problems" && <ProblemsTab event={event} />}
      {active === "payments" && <PaymentsTab event={event} status={status} />}
      {active === "media" && <MediaTab event={event} />}
      {active === "certificates" && <CertificatesTab event={event} />}
      {active === "linkedin" && <LinkedInTab event={event} />}
      {active === "report" && <ReportTab event={event} tenant={tenant} />}
      {active === "details" && <DetailsTab event={event} campuses={tenant.campuses} />}
    </div>
  );
}

async function DetailsTab({ event, campuses }: { event: ElevateEvent; campuses: import("@/lib/types").Campus[] }) {
  const [fests, families, tags] = await Promise.all([
    event.type === "TECH_FEST" ? Promise.resolve([] as ElevateEvent[]) : apiList<ElevateEvent>("/events?type=TECH_FEST"),
    getEventTypes(true),
    getTags(true),
  ]);
  return <div className="max-w-4xl"><EventForm campuses={campuses} event={event} parents={fests.map((f) => ({ id: f.id, title: f.title }))} families={families} tagSuggestions={tags.map((t) => t.tag)} /></div>;
}
