import { EVENT_FAMILIES, EVENT_TYPE_LABELS, familyOf, formatMoney, type EventFamily, type EventType } from "@elevate/shared";
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

/**
 * People who took part: registrations on this site, or, for events run before the site existed,
 * the figure recorded on the event (config.participants).
 */
export function participantCount(e: ElevateEvent): number {
  const regs = eventCount(e, "registrations") ?? 0;
  const recorded = Number(e.config?.participants ?? 0) || Number(e.config?.registered ?? 0);
  return regs || (Number.isFinite(recorded) ? recorded : 0);
}

/** "186 participants" or "285 registered": registrations on the site, else what was recorded for older events. */
export function turnoutLabel(e: ElevateEvent): string | null {
  const regs = eventCount(e, "registrations") ?? 0;
  if (regs) return `${regs.toLocaleString("en-IN")} registered`;
  const participants = Number(e.config?.participants ?? 0);
  if (participants) return `${participants.toLocaleString("en-IN")} participants`;
  const registered = Number(e.config?.registered ?? 0);
  if (registered) return `${registered.toLocaleString("en-IN")} registered`;
  return null;
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

/** Event type groups for pickers and legends: the shared event families. */
export const EVENT_TYPE_GROUPS: { key: EventFamily; label: string; types: EventType[] }[] = EVENT_FAMILIES.map((f) => ({ key: f.key, label: f.label, types: f.types }));

/** Display label for an event: the brand's own type name, else the built-in type label. */
export function eventLabel(e: Pick<ElevateEvent, "type"> & { category?: { name: string } | null }): string {
  return e.category?.name ?? typeLabel(e.type);
}

/** Family of an event (from the payload, or computed from its type). */
export function eventFamily(e: Pick<ElevateEvent, "type"> & { family?: EventFamily }): EventFamily {
  return e.family ?? familyOf(e.type);
}

export function familyLabel(f: string): string {
  return EVENT_FAMILIES.find((x) => x.key === f)?.label ?? humanize(f);
}

export function isFamily(f: unknown): f is EventFamily {
  return typeof f === "string" && EVENT_FAMILIES.some((x) => x.key === f);
}

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

/** Paise → "₹1,499". Null/undefined → "Free". */
export function money(amount?: number | null, currency = "INR"): string {
  if (!amount) return "Free";
  return formatMoney(amount, currency);
}

/** Rupees typed by an admin ("1499.50") → paise (149950). Empty → undefined. */
export function rupeesToPaise(v: string | null | undefined): number | undefined {
  const t = (v ?? "").toString().trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function paiseToRupees(v?: number | null): string {
  return v ? String(v / 100) : "";
}

/** Event fee summary from either the `fee` object (detail) or raw fields (admin). */
export function eventFee(e: Pick<ElevateEvent, "fee" | "feeAmount" | "currency" | "feeType" | "earlyBirdAmount" | "earlyBirdEndsAt">) {
  if (e.fee) return e.fee;
  if (!e.feeAmount) return null;
  const early = e.earlyBirdAmount != null && e.earlyBirdEndsAt && new Date(e.earlyBirdEndsAt).getTime() > Date.now();
  return {
    amount: e.feeAmount, currency: e.currency ?? "INR", feeType: e.feeType ?? "PER_PERSON",
    earlyBirdAmount: e.earlyBirdAmount, earlyBirdEndsAt: e.earlyBirdEndsAt,
    currentAmount: early ? e.earlyBirdAmount! : e.feeAmount,
  };
}

export const AWARD_LABELS: Record<string, string> = {
  WINNER: "Winner", RUNNER_UP: "1st runner-up", SECOND_RUNNER_UP: "2nd runner-up", SPECIAL_MENTION: "Special mention", FINALIST: "Finalist",
};
