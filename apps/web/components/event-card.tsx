import Link from "next/link";
import { CalendarDays, MapPin, Users, Video } from "lucide-react";
import { eventCampuses, eventLabel, fmtRange, humanize, turnoutLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, StatusBadge } from "./ui/badge";
import { posterIcons } from "./poster-icons";

/**
 * Event cover image; without one, a generated brand poster: the event type and topic graphics (icons picked from
 * the title and tags) on the brand gradient. The title, date and place are shown next to the poster, not on it.
 */
export function EventCover({ event, className = "h-40", iconUrl, showLabel = true }: { event: ElevateEvent; className?: string; iconUrl?: string; showLabel?: boolean }) {
  if (event.coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={event.coverImageUrl} alt="" className={`${className} w-full object-cover`} />;
  }
  const [Main, First, Second] = posterIcons(event);
  return (
    <div className={`${className} relative w-full overflow-hidden bg-hero-bg text-hero-fg [container-type:size]`} role="img" aria-label={`${eventLabel(event)}: ${event.title}`}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(70% 90% at 100% 0%, rgb(var(--gradient-from) / 0.6), transparent 65%), radial-gradient(60% 80% at 0% 100%, rgb(var(--gradient-to) / 0.45), transparent 60%)" }}
      />
      {/* faint grid, like the brand posters */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(rgb(var(--hero-fg)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--hero-fg)) 1px, transparent 1px)", backgroundSize: "8cqw 8cqw" }}
      />
      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" aria-hidden className="absolute -left-[8%] top-1/2 h-[120%] w-auto -translate-y-1/2 opacity-[0.08]" />
      )}
      <div aria-hidden className="absolute inset-0">
        {Main && (
          <span className="absolute left-[58%] top-[56%] flex aspect-square w-[min(34cqw,62cqh)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-hero-fg/[0.07] shadow-[0_0_80px_rgb(var(--hero-accent)/0.25)] ring-1 ring-inset ring-hero-fg/15">
            <Main className="h-1/2 w-1/2 text-hero-accent" strokeWidth={1.5} />
          </span>
        )}
        {First && (
          <span className="absolute left-[82%] top-[30%] flex aspect-square w-[min(15cqw,27cqh)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-hero-fg/[0.08] ring-1 ring-inset ring-hero-fg/15">
            <First className="h-1/2 w-1/2 text-hero-fg/90" strokeWidth={1.75} />
          </span>
        )}
        {Second && (
          <span className="absolute left-[34%] top-[78%] flex aspect-square w-[min(12cqw,22cqh)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-hero-fg/[0.06] ring-1 ring-inset ring-hero-fg/10">
            <Second className="h-1/2 w-1/2 text-hero-fg/75" strokeWidth={1.75} />
          </span>
        )}
      </div>
      {showLabel && (
        <span className="absolute left-[5cqw] top-[7cqh] w-fit rounded-full bg-hero-fg/10 px-[2.5cqw] py-[0.8cqw] text-[clamp(9px,2.6cqw,14px)] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-hero-fg/25">
          {eventLabel(event)}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" />
    </div>
  );
}

export function ModeBadge({ mode }: { mode: ElevateEvent["mode"] }) {
  const tone = mode === "ONLINE" ? "blue" : mode === "HYBRID" ? "purple" : "gray";
  return <Badge tone={tone}>{mode === "ONLINE" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{humanize(mode)}</Badge>;
}

/** Day and month in India time, for the calendar tile on cards. */
function dateTile(iso: string) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...o });
  return { day: part({ day: "numeric" }), month: part({ month: "short" }).toUpperCase() };
}

export function EventCard({ event, href }: { event: ElevateEvent; href?: string }) {
  const campuses = eventCampuses(event);
  const turnout = turnoutLabel(event);
  const teams = Number(event.config?.teams ?? 0);
  const { day, month } = dateTile(event.startsAt);
  const where = event.scope === "CENTRAL" ? "Central (HQ)" : campuses.map((c) => c.city ?? c.name).join(" + ") || "Campus event";
  return (
    <Link
      href={href ?? `/events/${event.slug}`}
      data-reveal
      className="card-glow group flex flex-col overflow-hidden rounded-brand border border-border/80 bg-card shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative overflow-hidden">
        <div className="transition duration-700 ease-out group-hover:scale-[1.04]">
          <EventCover event={event} className="aspect-[16/9] h-auto" showLabel={false} />
        </div>
        {/* Calendar tile and status, as glass chips over the cover */}
        <div className="glass-light absolute left-3 top-3 flex w-12 flex-col items-center overflow-hidden rounded-xl text-center shadow-soft">
          <span className="w-full bg-primary py-0.5 text-[9px] font-bold tracking-wider text-primary-fg">{month}</span>
          <span className="py-0.5 font-heading text-lg font-extrabold leading-tight text-fg">{day}</span>
        </div>
        <div className="absolute right-3 top-3 flex gap-1.5">
          <StatusBadge status={event.status} />
          {event.mode !== "OFFLINE" && <ModeBadge mode={event.mode} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eventLabel(event)}</p>
          <h3 className="font-heading text-lg font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">{event.title}</h3>
          {event.tagline && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{event.tagline}</p>}
        </div>
        {!!event.tags?.length && (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {event.tags.slice(0, 3).map((t) => <li key={t} className="rounded-full bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-inset ring-primary/15">#{t}</li>)}
            {event.tags.length > 3 && <li className="px-1 py-0.5 text-[11px] text-muted">+{event.tags.length - 3}</li>}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-accent" />{fmtRange(event.startsAt, event.endsAt)}</span>
          <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-accent" />{where}</span>
          {turnout && <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-accent" />{turnout}{teams ? ` · ${teams} teams` : ""}</span>}
        </div>
      </div>
    </Link>
  );
}
