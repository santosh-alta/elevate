import Link from "next/link";
import { CalendarDays, MapPin, Users, Video } from "lucide-react";
import { eventCampuses, eventLabel, fmtRange, humanize, turnoutLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, StatusBadge } from "./ui/badge";

/** Short poster date in India time, e.g. "11–12 Apr 2026" or "30 Apr – 2 May 2026". */
function posterDate(startsAt: string, endsAt: string): string {
  const tz = "Asia/Kolkata";
  const a = new Date(startsAt), b = new Date(endsAt);
  const part = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IN", { timeZone: tz, ...o });
  const sameDay = part(a, { dateStyle: "short" }) === part(b, { dateStyle: "short" });
  if (sameDay) return part(a, { day: "numeric", month: "short", year: "numeric" });
  if (part(a, { month: "short", year: "numeric" }) === part(b, { month: "short", year: "numeric" })) {
    return `${part(a, { day: "numeric" })}–${part(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${part(a, { day: "numeric", month: "short" })} – ${part(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

/**
 * Event cover image; without one, a generated brand poster: event type, title, who organised it and when,
 * on the brand gradient (with the brand mark as a watermark when given). Text scales with the poster's width.
 */
export function EventCover({ event, className = "h-40", iconUrl, showLabel = true }: { event: ElevateEvent; className?: string; iconUrl?: string; showLabel?: boolean }) {
  if (event.coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={event.coverImageUrl} alt="" className={`${className} w-full object-cover`} />;
  }
  const campuses = eventCampuses(event);
  const where = event.scope === "CENTRAL"
    ? "Central (HQ)"
    : campuses.map((c) => (c.city ? `${c.code || c.name} · ${c.city}` : c.code || c.name)).join(" + ") || "Campus event";
  return (
    <div className={`${className} relative w-full overflow-hidden bg-hero-bg text-hero-fg [container-type:inline-size]`}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(70% 90% at 100% 0%, rgb(var(--gradient-from) / 0.6), transparent 65%), radial-gradient(60% 80% at 0% 100%, rgb(var(--gradient-to) / 0.45), transparent 60%)" }}
      />
      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" aria-hidden className="absolute -right-[6%] top-1/2 h-[120%] w-auto -translate-y-1/2 opacity-[0.14]" />
      )}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col justify-between p-[6cqw]">
          <span className="w-fit rounded-full bg-hero-fg/10 px-[2.5cqw] py-[0.8cqw] text-[clamp(9px,2.6cqw,14px)] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-hero-fg/25">
            {eventLabel(event)}
          </span>
          <div className="space-y-[2cqw]">
            <p className="line-clamp-3 max-w-[85%] font-heading text-[clamp(16px,7.5cqw,44px)] font-bold leading-[1.05] tracking-tight">{event.title}</p>
            <p className="flex flex-wrap items-center gap-x-[2.5cqw] gap-y-1 text-[clamp(10px,2.8cqw,16px)] font-medium text-hero-fg/85">
              <span className="text-hero-accent">{where}</span>
              <span aria-hidden>•</span>
              <span>{posterDate(event.startsAt, event.endsAt)}</span>
            </p>
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" />
    </div>
  );
}

export function ModeBadge({ mode }: { mode: ElevateEvent["mode"] }) {
  const tone = mode === "ONLINE" ? "blue" : mode === "HYBRID" ? "purple" : "gray";
  return <Badge tone={tone}>{mode === "ONLINE" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{humanize(mode)}</Badge>;
}

export function EventCard({ event, href }: { event: ElevateEvent; href?: string }) {
  const campuses = eventCampuses(event);
  const turnout = turnoutLabel(event);
  const teams = Number(event.config?.teams ?? 0);
  return (
    <Link
      href={href ?? `/events/${event.slug}`}
      className="group flex flex-col overflow-hidden rounded-brand border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <EventCover event={event} className="aspect-[16/9] h-auto" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={event.status} />
          <ModeBadge mode={event.mode} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{eventLabel(event)}</p>
          <h3 className="font-heading text-lg font-bold leading-snug tracking-tight group-hover:underline group-hover:decoration-accent group-hover:decoration-2 group-hover:underline-offset-4">{event.title}</h3>
          {event.tagline && <p className="mt-1 line-clamp-2 text-sm text-muted">{event.tagline}</p>}
        </div>
        {!!event.tags?.length && (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {event.tags.slice(0, 3).map((t) => <li key={t} className="rounded-full bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-inset ring-primary/15">#{t}</li>)}
            {event.tags.length > 3 && <li className="px-1 py-0.5 text-[11px] text-muted">+{event.tags.length - 3}</li>}
          </ul>
        )}
        <div className="mt-auto space-y-1 text-xs text-muted">
          <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtRange(event.startsAt, event.endsAt)}</p>
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {event.scope === "CENTRAL" ? "Central (HQ)" : campuses.map((c) => c.name).join(" + ") || "Campus event"}
          </p>
          {turnout && (
            <p className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {turnout}{teams ? ` · ${teams} teams` : ""}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
