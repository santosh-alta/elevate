import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Video } from "lucide-react";
import { apiGet } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { fmtRange, humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent, Guest } from "@/lib/types";
import { Badge, Card, CardBody } from "@/components/ui";
import { GuestPortalForm } from "./portal-form";

export const metadata: Metadata = { title: "Guest information", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

interface PortalPayload extends Omit<Partial<Guest>, "host"> { guest?: Guest; event?: ElevateEvent; editable?: boolean; host?: { name: string; email?: string; phone?: string | null } | null }

export default async function GuestPortalPage({ params }: Props) {
  const { token } = await params;
  const tenant = await requireTenant();
  const d = await apiGet<PortalPayload>(`/guest-portal/${encodeURIComponent(token)}`);
  if (!d) notFound();
  const guest = { ...(d.guest ?? {}), host: undefined } as Guest;
  if (!d.guest) Object.assign(guest, d, { host: undefined });
  const event = d.event ?? d.guest?.event;
  const host = d.host ?? (d.guest?.host as PortalPayload["host"]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{tenant.name}</p>
      <h1 className="mt-2 text-3xl font-bold">Welcome, {guest.name?.split(" ")[0] ?? "and thank you"}</h1>
      <p className="mt-2 text-muted">
        Thank you for joining us{guest.role ? ` as ${humanize(guest.role).toLowerCase()}` : ""}. Please share a few details so we can introduce you
        to our students and plan your visit. It takes about five minutes.
      </p>

      {event && (
        <Card className="mt-6">
          <CardBody className="space-y-2">
            <div className="flex flex-wrap gap-2"><Badge tone="primary">{typeLabel(event.type)}</Badge><Badge>{humanize(event.mode)}</Badge></div>
            <p className="text-lg font-semibold">{event.title}</p>
            {event.tagline && <p className="text-sm text-muted">{event.tagline}</p>}
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{fmtRange(event.startsAt, event.endsAt)}</p>
              <p className="flex items-center gap-2">{event.mode === "ONLINE" ? <Video className="h-4 w-4 text-primary" /> : <MapPin className="h-4 w-4 text-primary" />}{event.venue ?? (event.mode === "ONLINE" ? "Online" : "Venue to be shared")}</p>
            </div>
            {host && <p className="border-t border-border pt-3 text-sm text-muted">Your point of contact: <span className="font-medium text-fg">{host.name}</span>{host.email ? ` · ${host.email}` : ""}{host.phone ? ` · ${host.phone}` : ""}</p>}
          </CardBody>
        </Card>
      )}

      <div className="mt-8">
        <GuestPortalForm token={token} guest={guest} alreadySubmitted={!!guest.profileSubmittedAt} locked={d.editable === false} />
      </div>
    </div>
  );
}
