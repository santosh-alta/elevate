import type { Campus, ElevateEvent } from "./types";

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
