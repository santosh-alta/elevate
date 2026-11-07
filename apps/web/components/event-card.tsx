import Link from "next/link";
import { CalendarDays, MapPin, Users, Video } from "lucide-react";
import { eventCampuses, eventCount, fmtRange, humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, StatusBadge } from "./ui/badge";

/** Event cover image, or a brand-coloured placeholder (optionally with the brand icon as a watermark). */
export function EventCover({ event, className = "h-40", iconUrl }: { event: ElevateEvent; className?: string; iconUrl?: string }) {
  if (event.coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={event.coverImageUrl} alt="" className={`${className} w-full object-cover`} />;
  }
  return (
    <div className={`${className} relative w-full overflow-hidden bg-hero-bg`}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(70% 90% at 100% 0%, rgb(var(--gradient-from) / 0.55), transparent 65%), radial-gradient(60% 80% at 0% 100%, rgb(var(--gradient-to) / 0.4), transparent 60%)" }}
      />
      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" aria-hidden className="absolute -right-[6%] top-1/2 h-[120%] w-auto -translate-y-1/2 opacity-[0.14]" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" />
      <span className="absolute bottom-3 left-4 text-xs font-semibold uppercase tracking-widest text-hero-fg">{typeLabel(event.type)}</span>
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
      className="group flex flex-col overflow-hidden rounded-brand border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <EventCover event={event} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={event.status} />
          <ModeBadge mode={event.mode} />
        </div>
        <div>
          <h3 className="font-heading text-lg font-bold leading-snug tracking-tight group-hover:underline group-hover:decoration-accent group-hover:decoration-2 group-hover:underline-offset-4">{event.title}</h3>
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
