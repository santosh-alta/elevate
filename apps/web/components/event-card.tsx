import Link from "next/link";
import { CalendarDays, MapPin, Users, Video } from "lucide-react";
import { eventCampuses, eventCount, fmtRange, humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, StatusBadge } from "./ui/badge";

export function EventCover({ event, className = "h-40" }: { event: ElevateEvent; className?: string }) {
  if (event.coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={event.coverImageUrl} alt="" className={`${className} w-full object-cover`} />;
  }
  return (
    <div className={`${className} relative w-full overflow-hidden bg-gradient-to-br from-primary to-accent`}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 70%, white 0, transparent 35%)" }} />
      <span className="absolute bottom-3 left-4 text-xs font-semibold uppercase tracking-widest text-white/90">{typeLabel(event.type)}</span>
    </div>
  );
}

export function ModeBadge({ mode }: { mode: ElevateEvent["mode"] }) {
  const tone = mode === "ONLINE" ? "blue" : mode === "HYBRID" ? "purple" : "gray";
  return <Badge tone={tone}>{mode === "ONLINE" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{humanize(mode)}</Badge>;
}

export function EventCard({ event, href }: { event: ElevateEvent; href?: string }) {
  const campuses = eventCampuses(event);
  const regs = eventCount(event, "registrations");
  return (
    <Link
      href={href ?? `/events/${event.slug}`}
      className="group flex flex-col overflow-hidden rounded-brand border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <EventCover event={event} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={event.status} />
          <ModeBadge mode={event.mode} />
        </div>
        <div>
          <h3 className="font-semibold leading-snug group-hover:text-primary">{event.title}</h3>
          {event.tagline && <p className="mt-1 line-clamp-2 text-sm text-muted">{event.tagline}</p>}
        </div>
        <div className="mt-auto space-y-1 text-xs text-muted">
          <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtRange(event.startsAt, event.endsAt)}</p>
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {event.scope === "CENTRAL" ? "All campuses" : campuses.map((c) => c.name).join(", ") || "Campus event"}
          </p>
          {regs !== undefined && <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{regs} registered</p>}
        </div>
      </div>
    </Link>
  );
}
