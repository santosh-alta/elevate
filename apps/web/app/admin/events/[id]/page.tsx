import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { apiGet } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { eventCampuses, fmtRange, humanize } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
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

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = await apiGet<ElevateEvent>(`/events/${id}`);
  return { title: e?.title ?? "Event" };
}

export default async function EventCommandCentre({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const event = await apiGet<ElevateEvent>(`/events/${id}`);
  if (!event) notFound();
  const tenant = await requireTenant();
  const m = event.modules ?? {};

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "checklist", label: "Checklist" },
    ...(m.guests ? [{ key: "guests", label: "Guests" }] : []),
    { key: "registrations", label: "Registrations" },
    ...(m.teams || m.judging ? [{ key: "judging", label: "Teams & judging" }] : []),
    { key: "media", label: "Media & social" },
    ...(m.certificates !== false ? [{ key: "certificates", label: "Certificates" }] : []),
    { key: "linkedin", label: "LinkedIn" },
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
              <Badge tone="primary">{humanize(event.type)}</Badge>
              <ModeBadge mode={event.mode} />
              <Badge>{event.scope === "CENTRAL" ? "Central" : campuses.map((c) => c.name).join(", ") || "Campus"}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
            <p className="text-sm text-muted">{fmtRange(event.startsAt, event.endsAt)}{event.venue ? ` · ${event.venue}` : ""}</p>
          </div>
          <Link href={`/events/${event.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Public page <ExternalLink className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="mt-5"><Tabs tabs={tabs} active={active} baseHref={`/admin/events/${event.id}`} /></div>
      </div>

      {active === "overview" && <OverviewTab event={event} />}
      {active === "checklist" && <ChecklistTab event={event} />}
      {active === "guests" && <GuestsTab event={event} />}
      {active === "registrations" && <RegistrationsTab event={event} />}
      {active === "judging" && <JudgingTab event={event} />}
      {active === "media" && <MediaTab event={event} />}
      {active === "certificates" && <CertificatesTab event={event} />}
      {active === "linkedin" && <LinkedInTab event={event} />}
      {active === "report" && <ReportTab event={event} tenant={tenant} />}
      {active === "details" && <div className="max-w-4xl"><EventForm campuses={tenant.campuses} event={event} /></div>}
    </div>
  );
}
