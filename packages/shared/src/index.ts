// Shared constants, types and schemas for Elevate (API, web, mobile).
import { z } from "zod";

export const EVENT_TYPES = [
  "HACKATHON", "SEMINAR", "WORKSHOP", "GUEST_LECTURE", "COMPETITION",
  "BOOTCAMP", "WEBINAR", "CULTURAL", "ENTREPRENEURSHIP", "STARTUP_PITCH", "CONFERENCE",
  "PANEL_DISCUSSION", "MEETUP", "CAREER_FAIR", "INDUSTRY_VISIT", "ORIENTATION", "ALUMNI_MEET",
  "SPORTS", "OTHER",
] as const;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HACKATHON: "Hackathon", SEMINAR: "Seminar", WORKSHOP: "Workshop", GUEST_LECTURE: "Guest lecture",
  COMPETITION: "Competition", BOOTCAMP: "Bootcamp", WEBINAR: "Webinar", CULTURAL: "Cultural",
  ENTREPRENEURSHIP: "Entrepreneurship", STARTUP_PITCH: "Startup pitch", CONFERENCE: "Conference",
  PANEL_DISCUSSION: "Panel discussion", MEETUP: "Meetup", CAREER_FAIR: "Career fair",
  INDUSTRY_VISIT: "Industry visit", ORIENTATION: "Orientation", ALUMNI_MEET: "Alumni meet",
  SPORTS: "Sports", OTHER: "Other",
};

export const GUEST_ROLES = ["SPEAKER", "CHIEF_GUEST", "PANELIST", "MODERATOR", "JUDGE", "MENTOR", "INVESTOR"] as const;
export const SPONSOR_TIERS = ["TITLE", "GOLD", "SILVER", "PARTNER", "COMMUNITY"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_SCOPES = ["CENTRAL", "CAMPUS"] as const;
export const EVENT_MODES = ["ONLINE", "OFFLINE", "HYBRID"] as const;

/** Ordered lifecycle. CANCELLED can be reached from any non-final state. */
export const EVENT_STATUS_FLOW = [
  "DRAFT", "PLANNING", "ANNOUNCED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED",
  "LIVE", "JUDGING", "COMPLETED", "ARCHIVED",
] as const;
export const EVENT_STATUSES = [...EVENT_STATUS_FLOW, "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const ROLES = [
  "BRAND_ADMIN", "CAMPUS_ADMIN", "EVENT_MANAGER", "JUDGE", "VOLUNTEER", "SPEAKER", "STUDENT",
] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ["BRAND_ADMIN", "CAMPUS_ADMIN", "EVENT_MANAGER"];

export const CERTIFICATE_TYPES = [
  "PARTICIPATION", "WINNER", "RUNNER_UP", "SPECIAL_MENTION", "JUDGE", "SPEAKER", "VOLUNTEER", "MENTOR",
] as const;

export const SOCIAL_PLATFORMS = ["LINKEDIN", "INSTAGRAM", "X", "FACEBOOK", "YOUTUBE", "WHATSAPP"] as const;
export const MEDIA_KINDS = ["PHOTO_ALBUM", "PHOTO", "VIDEO", "POSTER", "GUEST_PHOTO", "DECK", "REPORT", "OTHER"] as const;

// ───────── Modules ─────────

export interface EventModules {
  teams: boolean;
  judging: boolean;
  submissions: boolean;
  guests: boolean;
  checkin: boolean;
  certificates: boolean;
  feedback: boolean;
  budget: boolean;
  sponsors: boolean;
}

const BASE_MODULES: EventModules = {
  teams: false, judging: false, submissions: false, guests: false,
  checkin: true, certificates: true, feedback: true, budget: false, sponsors: false,
};

export const DEFAULT_MODULES: Record<EventType, EventModules> = {
  HACKATHON: { ...BASE_MODULES, teams: true, judging: true, submissions: true, budget: true },
  COMPETITION: { ...BASE_MODULES, teams: true, judging: true, submissions: true },
  SEMINAR: { ...BASE_MODULES, guests: true, budget: true },
  GUEST_LECTURE: { ...BASE_MODULES, guests: true, budget: true },
  WORKSHOP: { ...BASE_MODULES, guests: true },
  BOOTCAMP: { ...BASE_MODULES, guests: true, submissions: true },
  WEBINAR: { ...BASE_MODULES, guests: true, checkin: false },
  CULTURAL: { ...BASE_MODULES, budget: true, sponsors: true },
  ENTREPRENEURSHIP: { ...BASE_MODULES, guests: true, budget: true, sponsors: true },
  STARTUP_PITCH: { ...BASE_MODULES, teams: true, judging: true, submissions: true, guests: true, budget: true, sponsors: true },
  CONFERENCE: { ...BASE_MODULES, guests: true, budget: true, sponsors: true },
  PANEL_DISCUSSION: { ...BASE_MODULES, guests: true },
  MEETUP: { ...BASE_MODULES, guests: true },
  CAREER_FAIR: { ...BASE_MODULES, guests: true, budget: true, sponsors: true },
  INDUSTRY_VISIT: { ...BASE_MODULES, guests: true, budget: true },
  ORIENTATION: { ...BASE_MODULES, guests: true },
  ALUMNI_MEET: { ...BASE_MODULES, guests: true, budget: true },
  SPORTS: { ...BASE_MODULES, teams: true, budget: true, sponsors: true },
  OTHER: { ...BASE_MODULES },
};

// ───────── Checklist templates (defaults; brands can override in TaskTemplate) ─────────

export type TaskPhase = "PRE" | "DURING" | "POST";
export interface ChecklistItem { phase: TaskPhase; title: string; dueOffsetDays: number }

const POST_COMMON: ChecklistItem[] = [
  { phase: "POST", title: "Upload event photos (Drive folder link)", dueOffsetDays: 1 },
  { phase: "POST", title: "Publish social media posts (LinkedIn, Instagram)", dueOffsetDays: 2 },
  { phase: "POST", title: "Generate and send certificates", dueOffsetDays: 2 },
  { phase: "POST", title: "Send LinkedIn post suggestions to participants", dueOffsetDays: 2 },
  { phase: "POST", title: "Send feedback form", dueOffsetDays: 1 },
  { phase: "POST", title: "Publish outcome report", dueOffsetDays: 5 },
];

const GUEST_EVENT: ChecklistItem[] = [
  { phase: "PRE", title: "Finalise topic and date", dueOffsetDays: -21 },
  { phase: "PRE", title: "Invite guest / speaker", dueOffsetDays: -20 },
  { phase: "PRE", title: "Collect guest photo, bio and designation", dueOffsetDays: -14 },
  { phase: "PRE", title: "Design event poster", dueOffsetDays: -12 },
  { phase: "PRE", title: "Book venue and AV / meeting link", dueOffsetDays: -10 },
  { phase: "PRE", title: "Announce event and open registrations", dueOffsetDays: -10 },
  { phase: "PRE", title: "Arrange guest travel and stay", dueOffsetDays: -5 },
  { phase: "PRE", title: "Prepare memento and certificate for guest", dueOffsetDays: -2 },
  { phase: "DURING", title: "Welcome guest", dueOffsetDays: 0 },
  { phase: "DURING", title: "Assign photographer / videographer", dueOffsetDays: 0 },
  { phase: "DURING", title: "QR attendance check-in", dueOffsetDays: 0 },
  { phase: "DURING", title: "Post live stories on social", dueOffsetDays: 0 },
  { phase: "POST", title: "Send thank-you note to guest", dueOffsetDays: 1 },
  ...POST_COMMON,
];

const HACKATHON: ChecklistItem[] = [
  { phase: "PRE", title: "Finalise problem statements / tracks", dueOffsetDays: -30 },
  { phase: "PRE", title: "Publish rules and judging rubric", dueOffsetDays: -28 },
  { phase: "PRE", title: "Confirm prizes and sponsors", dueOffsetDays: -25 },
  { phase: "PRE", title: "Invite judges and mentors", dueOffsetDays: -21 },
  { phase: "PRE", title: "Announce hackathon and open registrations", dueOffsetDays: -21 },
  { phase: "PRE", title: "Close team formation", dueOffsetDays: -3 },
  { phase: "PRE", title: "Venue, Wi-Fi, power and food arranged", dueOffsetDays: -3 },
  { phase: "DURING", title: "Participant check-in", dueOffsetDays: 0 },
  { phase: "DURING", title: "Kickoff and briefing", dueOffsetDays: 0 },
  { phase: "DURING", title: "Mentor rounds", dueOffsetDays: 0 },
  { phase: "DURING", title: "Submission deadline", dueOffsetDays: 1 },
  { phase: "DURING", title: "Judging rounds", dueOffsetDays: 1 },
  { phase: "DURING", title: "Announce results", dueOffsetDays: 1 },
  ...POST_COMMON,
];

const GENERIC: ChecklistItem[] = [
  { phase: "PRE", title: "Finalise agenda and date", dueOffsetDays: -14 },
  { phase: "PRE", title: "Design poster", dueOffsetDays: -10 },
  { phase: "PRE", title: "Book venue / meeting link", dueOffsetDays: -10 },
  { phase: "PRE", title: "Announce and open registrations", dueOffsetDays: -7 },
  { phase: "DURING", title: "Attendance check-in", dueOffsetDays: 0 },
  { phase: "DURING", title: "Photographs and videos", dueOffsetDays: 0 },
  ...POST_COMMON,
];

const ENTREPRENEURSHIP: ChecklistItem[] = [
  { phase: "PRE", title: "Finalise theme, format and date", dueOffsetDays: -30 },
  { phase: "PRE", title: "Shortlist founders / investors / speakers", dueOffsetDays: -28 },
  { phase: "PRE", title: "Send guest invites and share guest portal link", dueOffsetDays: -25 },
  { phase: "PRE", title: "Collect guest photo, bio, talk title and consent", dueOffsetDays: -14 },
  { phase: "PRE", title: "Confirm sponsors / incubator partners", dueOffsetDays: -14 },
  { phase: "PRE", title: "Design poster and speaker creatives", dueOffsetDays: -12 },
  { phase: "PRE", title: "Publish event page and open registrations", dueOffsetDays: -10 },
  { phase: "PRE", title: "Book venue, AV and livestream", dueOffsetDays: -7 },
  { phase: "PRE", title: "Arrange guest travel, stay and host (point of contact)", dueOffsetDays: -5 },
  { phase: "PRE", title: "Share guest briefs with hosts", dueOffsetDays: -2 },
  { phase: "PRE", title: "Prepare mementos and certificates", dueOffsetDays: -2 },
  { phase: "DURING", title: "Receive guests", dueOffsetDays: 0 },
  { phase: "DURING", title: "QR attendance check-in", dueOffsetDays: 0 },
  { phase: "DURING", title: "Photos, videos and live stories", dueOffsetDays: 0 },
  { phase: "DURING", title: "Q&A / networking session", dueOffsetDays: 0 },
  { phase: "POST", title: "Send thank-you notes to guests and sponsors", dueOffsetDays: 1 },
  { phase: "POST", title: "Settle honorarium and invoices", dueOffsetDays: 7 },
  ...POST_COMMON,
];

export const DEFAULT_CHECKLISTS: Record<EventType, ChecklistItem[]> = {
  HACKATHON: HACKATHON,
  COMPETITION: HACKATHON,
  SEMINAR: GUEST_EVENT,
  GUEST_LECTURE: GUEST_EVENT,
  WORKSHOP: GUEST_EVENT,
  WEBINAR: GUEST_EVENT,
  BOOTCAMP: GENERIC,
  CULTURAL: GENERIC,
  ENTREPRENEURSHIP: ENTREPRENEURSHIP,
  STARTUP_PITCH: HACKATHON,
  CONFERENCE: ENTREPRENEURSHIP,
  PANEL_DISCUSSION: GUEST_EVENT,
  MEETUP: GENERIC,
  CAREER_FAIR: ENTREPRENEURSHIP,
  INDUSTRY_VISIT: GENERIC,
  ORIENTATION: GUEST_EVENT,
  ALUMNI_MEET: GUEST_EVENT,
  SPORTS: GENERIC,
  OTHER: GENERIC,
};

// ───────── Theme ─────────

export interface BrandTheme {
  colors: {
    primary: string; primaryFg: string; accent: string;
    bg: string; fg: string; muted: string; card: string; border: string;
  };
  logoUrl?: string;
  faviconUrl?: string;
  font?: string;     // Google Font family name
  radius?: number;   // px
}

export const DEFAULT_THEME: BrandTheme = {
  colors: {
    primary: "#4f46e5", primaryFg: "#ffffff", accent: "#f59e0b",
    bg: "#f8fafc", fg: "#0f172a", muted: "#64748b", card: "#ffffff", border: "#e2e8f0",
  },
  font: "Inter",
  radius: 12,
};

export function resolveTheme(theme: Partial<BrandTheme> | null | undefined): BrandTheme {
  return { ...DEFAULT_THEME, ...theme, colors: { ...DEFAULT_THEME.colors, ...(theme?.colors ?? {}) } };
}

// ───────── Request schemas ─────────

export const createEventSchema = z.object({
  title: z.string().min(3),
  tagline: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(EVENT_TYPES),
  scope: z.enum(EVENT_SCOPES).default("CENTRAL"),
  mode: z.enum(EVENT_MODES).default("OFFLINE"),
  campusIds: z.array(z.string()).default([]),
  venue: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  livestreamUrl: z.string().url().optional(),
  venueMapUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  registrationOpensAt: z.coerce.date().optional(),
  registrationClosesAt: z.coerce.date().optional(),
  capacity: z.number().int().positive().optional(),
  requiresApproval: z.boolean().default(false),
  coverImageUrl: z.string().url().optional(),
  modules: z.record(z.boolean()).optional(),
  config: z.record(z.unknown()).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const scoreInputSchema = z.object({
  roundId: z.string(),
  teamId: z.string(),
  scores: z.array(z.object({
    criterionId: z.string(),
    value: z.number().min(0),
    comment: z.string().optional(),
  })),
  submit: z.boolean().default(false),
});
export type ScoreInput = z.infer<typeof scoreInputSchema>;

/** Unambiguous characters for human-typed codes (no 0/O, 1/I). */
export function randomCode(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
