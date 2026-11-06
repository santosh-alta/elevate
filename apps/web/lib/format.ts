import { EVENT_TYPE_LABELS, type EventType } from "@elevate/shared";
import type { Campus, ElevateEvent, Media } from "./types";

const TZ = "Asia/Kolkata";

export function fmtDate(d?: string | Date | null, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts });
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ });
}

export function fmtRange(a: string, b: string): string {
  const s = new Date(a), e = new Date(b);
  if (s.toDateString() === e.toDateString()) {
    return `${fmtDate(s)} · ${s.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ })} – ${e.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;
  }
  return `${fmtDate(s, { year: undefined })} – ${fmtDate(e)}`;
}

/** "GUEST_LECTURE" → "Guest lecture"; "registrationsCount" → "Registrations count" */
export function humanize(s: string): string {
  const spaced = s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function eventCampuses(e: ElevateEvent): Campus[] {
  return (e.campuses ?? []).map((c) => ("campus" in c ? c.campus : c));
}

export function eventCount(e: ElevateEvent, key: string): number | undefined {
  return e._count?.[key] ?? e.counts?.[key];
}

export function toLocalInput(d?: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** Display label for an event type ("STARTUP_PITCH" → "Startup pitch"). */
export function typeLabel(t: string): string {
  return EVENT_TYPE_LABELS[t as EventType] ?? humanize(t);
}

/** Event type groups for pickers. */
export const EVENT_TYPE_GROUPS: { label: string; types: EventType[] }[] = [
  { label: "Learning", types: ["SEMINAR", "WORKSHOP", "GUEST_LECTURE", "BOOTCAMP", "WEBINAR"] },
  { label: "Competitions", types: ["HACKATHON", "COMPETITION", "STARTUP_PITCH", "SPORTS"] },
  { label: "Community", types: ["ENTREPRENEURSHIP", "CONFERENCE", "PANEL_DISCUSSION", "MEETUP", "ALUMNI_MEET", "ORIENTATION", "CULTURAL"] },
  { label: "Career", types: ["CAREER_FAIR", "INDUSTRY_VISIT"] },
  { label: "Other", types: ["OTHER"] },
];

/** Badge colour per event type (calendar, lists). */
export function typeColor(t: string): string {
  const g = EVENT_TYPE_GROUPS.findIndex((x) => x.types.includes(t as EventType));
  return ["bg-blue-100 text-blue-800 border-blue-200", "bg-amber-100 text-amber-900 border-amber-200", "bg-emerald-100 text-emerald-800 border-emerald-200", "bg-violet-100 text-violet-800 border-violet-200", "bg-slate-100 text-slate-700 border-slate-200"][g < 0 ? 4 : g];
}

export function isImage(m: Pick<Media, "url" | "mimeType" | "kind">): boolean {
  if (m.mimeType) return m.mimeType.startsWith("image/");
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(m.url)) return true;
  return ["PHOTO", "GUEST_PHOTO", "POSTER"].includes(m.kind) && !/drive\.google|youtube|youtu\.be/.test(m.url);
}

/** Google Calendar "add event" link. */
export function googleCalendarUrl(e: Pick<ElevateEvent, "title" | "tagline" | "startsAt" | "endsAt" | "venue" | "meetingUrl">, pageUrl: string): string {
  const f = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${f(e.startsAt)}/${f(e.endsAt)}`,
    details: [e.tagline, pageUrl].filter(Boolean).join("\n\n"),
    location: e.venue ?? e.meetingUrl ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const GUEST_STATUS_LIST = ["PROPOSED", "INVITED", "CONFIRMED", "DECLINED", "ARRIVED", "THANKED"];
