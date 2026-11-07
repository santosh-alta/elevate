// Shared constants, types and schemas for Elevate (API, web, mobile).
import { z } from "zod";

export const EVENT_TYPES = [
  "HACKATHON", "SEMINAR", "WORKSHOP", "GUEST_LECTURE", "COMPETITION",
  "BOOTCAMP", "WEBINAR", "CULTURAL", "ENTREPRENEURSHIP", "STARTUP_PITCH", "CONFERENCE",
  "PANEL_DISCUSSION", "MEETUP", "CAREER_FAIR", "INDUSTRY_VISIT", "ORIENTATION", "ALUMNI_MEET",
  "SPORTS", "TECH_FEST", "INDUSTRY_SEMINAR", "CODING_CONTEST", "QUIZ", "OTHER",
] as const;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HACKATHON: "Hackathon", SEMINAR: "Seminar", WORKSHOP: "Workshop", GUEST_LECTURE: "Guest lecture",
  COMPETITION: "Competition", BOOTCAMP: "Bootcamp", WEBINAR: "Webinar", CULTURAL: "Cultural",
  ENTREPRENEURSHIP: "Entrepreneurship", STARTUP_PITCH: "Startup pitch", CONFERENCE: "Conference",
  PANEL_DISCUSSION: "Panel discussion", MEETUP: "Meetup", CAREER_FAIR: "Career fair",
  INDUSTRY_VISIT: "Industry visit", ORIENTATION: "Orientation", ALUMNI_MEET: "Alumni meet",
  SPORTS: "Sports", TECH_FEST: "Tech fest", INDUSTRY_SEMINAR: "Industry seminar", CODING_CONTEST: "Coding contest",
  QUIZ: "Quiz", OTHER: "Other",
};

export const GUEST_ROLES = ["SPEAKER", "CHIEF_GUEST", "PANELIST", "MODERATOR", "JUDGE", "MENTOR", "INVESTOR"] as const;
export const SPONSOR_TIERS = ["TITLE", "GOLD", "SILVER", "PARTNER", "COMMUNITY"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const FEE_TYPES = ["PER_PERSON", "PER_TEAM"] as const;
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
  "BRAND_ADMIN", "MODERATOR", "CAMPUS_ADMIN", "EVENT_MANAGER", "ORGANIZER", "JUDGE", "VOLUNTEER", "SPEAKER", "STUDENT",
] as const;
export type Role = (typeof ROLES)[number];
/** Brand staff: see every event (including hidden ones) and the staff tools. */
export const STAFF_ROLES: Role[] = ["BRAND_ADMIN", "MODERATOR", "CAMPUS_ADMIN", "EVENT_MANAGER"];
/** Can approve or reject event pages submitted by organizers. */
export const REVIEWER_ROLES: Role[] = ["BRAND_ADMIN", "MODERATOR"];
/** Can open the admin area (organizers see only their own events there). */
export const ADMIN_AREA_ROLES: Role[] = [...STAFF_ROLES, "ORGANIZER"];

export const ROLE_LABELS: Record<Role, string> = {
  BRAND_ADMIN: "Admin",
  MODERATOR: "Moderator",
  CAMPUS_ADMIN: "Campus admin",
  EVENT_MANAGER: "Event manager (staff)",
  ORGANIZER: "Organizer",
  JUDGE: "Judge",
  VOLUNTEER: "Volunteer",
  SPEAKER: "Speaker",
  STUDENT: "User",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  BRAND_ADMIN: "Everything for this brand: people and roles, settings, payments, approving events",
  MODERATOR: "Approves or rejects submitted event pages and can edit any event",
  CAMPUS_ADMIN: "Runs events for one campus",
  EVENT_MANAGER: "Staff who create and run events without needing approval",
  ORGANIZER: "Creates event pages; each one needs approval before it goes live",
  JUDGE: "Scores teams in assigned events",
  VOLUNTEER: "Checks people in at events",
  SPEAKER: "Speaks at events",
  STUDENT: "Registers for events",
};

export const APPROVAL_STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const CERTIFICATE_TYPES = [
  "PARTICIPATION", "FINALIST", "WINNER", "RUNNER_UP", "SPECIAL_MENTION", "JUDGE", "SPEAKER", "VOLUNTEER", "MENTOR",
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
  TECH_FEST: { ...BASE_MODULES, budget: true, sponsors: true, guests: true },
  INDUSTRY_SEMINAR: { ...BASE_MODULES, guests: true, budget: true, sponsors: true },
  CODING_CONTEST: { ...BASE_MODULES, judging: true, submissions: true },
  QUIZ: { ...BASE_MODULES, teams: true, judging: true },
  OTHER: { ...BASE_MODULES },
};

// ───────── Checklist templates (defaults; brands can override in TaskTemplate) ─────────

export type TaskPhase = "PRE" | "DURING" | "POST";

/** Who looks after a checklist task. People join teams in Admin → Team & roles. */
export const WORK_TEAMS = ["OWNER", "OPERATIONS", "SOCIAL_MEDIA"] as const;
export type WorkTeam = (typeof WORK_TEAMS)[number];
export const WORK_TEAM_LABELS: Record<WorkTeam, string> = {
  OWNER: "Event owner",
  OPERATIONS: "Operations",
  SOCIAL_MEDIA: "Social media",
};

export interface ChecklistItem {
  phase: TaskPhase;
  title: string;
  dueOffsetDays: number;
  /** Defaults from the title (see taskTeamFor) */
  team?: WorkTeam;
  /** A link (e.g. the Instagram post) must be added before the task can be marked done */
  proof?: boolean;
}

/** Best-guess team for a task title, used when a checklist item doesn't say. */
export function taskTeamFor(title: string): WorkTeam {
  const t = title.toLowerCase();
  if (/(announce|poster|creative|social|stor(y|ies)|reel|instagram|linkedin post|photo|video|media coverage|recap)/.test(t)) return "SOCIAL_MEDIA";
  if (/(venue|\bav\b|tech check|wi-?fi|power|food|travel|stay|transport|memento|goodies|welcome guest|receive guest|check-in|setup|standee|backdrop|escort)/.test(t)) return "OPERATIONS";
  return "OWNER";
}

/** Whether a task needs a proof link before it's done (announcements and published posts). */
export function taskNeedsProof(title: string): boolean {
  return /(announce|publish social|social media posts|live stories|recap post|post on)/i.test(title);
}

const POST_COMMON: ChecklistItem[] = [
  { phase: "POST", title: "Upload event photos (Drive folder link)", dueOffsetDays: 1 },
  { phase: "POST", title: "Publish social media posts (LinkedIn, Instagram)", dueOffsetDays: 2 },
  { phase: "POST", title: "Generate and send certificates", dueOffsetDays: 2 },
  { phase: "POST", title: "Send LinkedIn post suggestions to participants", dueOffsetDays: 2 },
  { phase: "POST", title: "Send feedback form", dueOffsetDays: 1 },
  { phase: "POST", title: "Publish outcome report", dueOffsetDays: 5 },
];

/** Offline seminar / guest session: the ALTA seminar workflow (plan → engage → capture → share). */
const SEMINAR_FLOW: ChecklistItem[] = [
  { phase: "PRE", team: "OWNER", title: "Confirm guest and send brief (audience, topic, duration, AV needs; slides by D-1)", dueOffsetDays: -7 },
  { phase: "PRE", team: "SOCIAL_MEDIA", proof: true, title: "Announce the event on Instagram and LinkedIn (add post link)", dueOffsetDays: -7 },
  { phase: "PRE", team: "OWNER", title: "Open registration and share the attendance QR", dueOffsetDays: -7 },
  { phase: "PRE", team: "OPERATIONS", title: "Run-of-show with timings; anchor / host assigned", dueOffsetDays: -3 },
  { phase: "PRE", team: "OPERATIONS", title: "Venue setup with ALTA-branded graphics (backdrop, standee, screen slide)", dueOffsetDays: -1 },
  { phase: "PRE", team: "OPERATIONS", title: "Tech check (mic, projector, clicker, slides loaded, backup laptop)", dueOffsetDays: -1 },
  { phase: "DURING", team: "OPERATIONS", title: "Welcome guest at the gate; escort to green room with water or tea", dueOffsetDays: 0 },
  { phase: "DURING", team: "SOCIAL_MEDIA", title: "Full media coverage (photos and video) from guest entry", dueOffsetDays: 0 },
  { phase: "DURING", team: "OWNER", title: "Welcome address, guest introduction and felicitation", dueOffsetDays: 0 },
  { phase: "DURING", team: "OWNER", title: "Main session, student interaction and Q&A", dueOffsetDays: 0 },
  { phase: "DURING", team: "OPERATIONS", title: "Vote of thanks and guest goodies (memento and certificate)", dueOffsetDays: 0 },
  { phase: "DURING", team: "SOCIAL_MEDIA", title: "Group and individual photos with the guest", dueOffsetDays: 0 },
  { phase: "DURING", team: "SOCIAL_MEDIA", proof: true, title: "Guest interview (2–3 min) and student reactions recorded (add video link)", dueOffsetDays: 0 },
  { phase: "DURING", team: "OWNER", title: "Feedback form sent to students within the hour", dueOffsetDays: 0 },
  { phase: "DURING", team: "OPERATIONS", title: "Guest escorted out; transport arranged", dueOffsetDays: 0 },
  { phase: "POST", team: "OWNER", title: "Thank-you message or email to the guest", dueOffsetDays: 1 },
  { phase: "POST", team: "SOCIAL_MEDIA", title: "Upload event photos to the gallery", dueOffsetDays: 1 },
  { phase: "POST", team: "SOCIAL_MEDIA", proof: true, title: "Recap posts: reel and photo carousel, guest tagged on LinkedIn and Instagram (add post links)", dueOffsetDays: 2 },
  { phase: "POST", team: "OWNER", title: "Generate and send certificates", dueOffsetDays: 2 },
  { phase: "POST", team: "OWNER", title: "Internal report (attendance count, feedback score, content links)", dueOffsetDays: 2 },
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
  { phase: "PRE", title: "Write the event page (about, rules, prizes, timeline, FAQs)", dueOffsetDays: -29 },
  { phase: "PRE", title: "Set registration fee, coupons and team size", dueOffsetDays: -28 },
  { phase: "PRE", title: "Set up judging rounds and parameters", dueOffsetDays: -21 },
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
  { phase: "DURING", title: "Release problem statements (online)", dueOffsetDays: 0 },
  { phase: "DURING", title: "Judging rounds (open each check, shortlist teams)", dueOffsetDays: 1 },
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

const CONTEST: ChecklistItem[] = [
  { phase: "PRE", title: "Set questions / problems and difficulty", dueOffsetDays: -14 },
  { phase: "PRE", title: "Write rules and scoring on the event page", dueOffsetDays: -12 },
  { phase: "PRE", title: "Confirm platform / venue and prizes", dueOffsetDays: -10 },
  { phase: "PRE", title: "Announce and open registrations", dueOffsetDays: -10 },
  { phase: "PRE", title: "Dry run with a test participant", dueOffsetDays: -2 },
  { phase: "DURING", title: "Attendance check-in", dueOffsetDays: 0 },
  { phase: "DURING", title: "Run rounds and record scores", dueOffsetDays: 0 },
  { phase: "DURING", title: "Announce results", dueOffsetDays: 0 },
  ...POST_COMMON,
];

export const DEFAULT_CHECKLISTS: Record<EventType, ChecklistItem[]> = {
  HACKATHON: HACKATHON,
  COMPETITION: HACKATHON,
  SEMINAR: SEMINAR_FLOW,
  GUEST_LECTURE: SEMINAR_FLOW,
  WORKSHOP: GUEST_EVENT,
  WEBINAR: GUEST_EVENT,
  BOOTCAMP: GENERIC,
  CULTURAL: GENERIC,
  ENTREPRENEURSHIP: ENTREPRENEURSHIP,
  STARTUP_PITCH: HACKATHON,
  CONFERENCE: ENTREPRENEURSHIP,
  PANEL_DISCUSSION: SEMINAR_FLOW,
  MEETUP: GENERIC,
  CAREER_FAIR: ENTREPRENEURSHIP,
  INDUSTRY_VISIT: GENERIC,
  ORIENTATION: GUEST_EVENT,
  ALUMNI_MEET: GUEST_EVENT,
  SPORTS: GENERIC,
  TECH_FEST: ENTREPRENEURSHIP,
  INDUSTRY_SEMINAR: SEMINAR_FLOW,
  CODING_CONTEST: CONTEST,
  QUIZ: CONTEST,
  OTHER: GENERIC,
};

// ───────── Theme ─────────

export interface BrandTheme {
  colors: {
    primary: string; primaryFg: string; accent: string;
    bg: string; fg: string; muted: string; card: string; border: string;
    /** Second brand colour (e.g. Alta green), used for success states and call-to-action highlights */
    secondary: string; secondaryFg: string;
    /** Small highlights: badges, "new", ribbons (e.g. Alta yellow) */
    highlight: string;
    /** Hero banners, site header/footer, email header/footer */
    heroBg: string; heroFg: string;
  };
  logoUrl?: string;
  /** Logo version for dark backgrounds (hero, footer, emails). Falls back to logoUrl */
  logoDarkUrl?: string;
  /** Square brand mark (favicon / app icon source) */
  iconUrl?: string;
  faviconUrl?: string;
  appleTouchIconUrl?: string;
  /** Default social share image (1200×630) for pages without a cover */
  ogImageUrl?: string;
  font?: string;         // body font, Google Font family name
  headingFont?: string;  // headings font, Google Font family name (defaults to font)
  /** Stylesheet for licensed fonts (e.g. an Adobe Fonts kit with Proxima Nova). Families named in font/headingFont are tried first */
  fontCssUrl?: string;
  radius?: number;       // px
  /** Two-colour brand gradient for bars and accents */
  gradient?: [string, string];
  tagline?: string;
  /** YouTube link played muted and looping behind the home page hero (e.g. an event aftermovie) */
  heroVideoUrl?: string;
}

/** YouTube video id from a watch, share, shorts or embed link (or a bare id). */
export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/) ?? url.match(/^([\w-]{11})$/);
  return m?.[1] ?? null;
}

export const DEFAULT_THEME: BrandTheme = {
  colors: {
    primary: "#4f46e5", primaryFg: "#ffffff", accent: "#f59e0b",
    bg: "#f8fafc", fg: "#0f172a", muted: "#64748b", card: "#ffffff", border: "#e2e8f0",
    secondary: "#0ea5e9", secondaryFg: "#ffffff", highlight: "#f59e0b",
    heroBg: "#1e1b4b", heroFg: "#ffffff",
  },
  font: "Inter",
  radius: 12,
};

type ThemeInput = Partial<Omit<BrandTheme, "colors">> & { colors?: Partial<BrandTheme["colors"]> };

export function resolveTheme(theme: ThemeInput | null | undefined): BrandTheme {
  const c = theme?.colors ?? {};
  const primary = c.primary ?? DEFAULT_THEME.colors.primary;
  const colors = {
    ...DEFAULT_THEME.colors,
    // Brands that set only the original 8 colours get sensible derived values.
    secondary: c.accent ?? DEFAULT_THEME.colors.secondary,
    highlight: c.accent ?? DEFAULT_THEME.colors.highlight,
    heroBg: primary,
    heroFg: c.primaryFg ?? DEFAULT_THEME.colors.heroFg,
    ...c,
  } as BrandTheme["colors"];
  return {
    ...DEFAULT_THEME,
    ...theme,
    colors,
    headingFont: theme?.headingFont ?? theme?.font ?? DEFAULT_THEME.font,
    logoDarkUrl: theme?.logoDarkUrl ?? theme?.logoUrl,
    gradient: theme?.gradient ?? [colors.primary, colors.accent],
  };
}

/** Alta School of Technology, from the Alta brand guidelines (ALTA/Alta brand guidelines.pdf, kept out of git). */
export const ALTA_THEME: ThemeInput = {
  colors: {
    primary: "#191445",      // Alta navy: logo wordmark, headings, primary buttons
    primaryFg: "#ffffff",
    accent: "#22ACD1",       // Alta sky blue: shield, links, focus
    secondary: "#08C191",    // Alta green: "Apply now / Register" call to action
    secondaryFg: "#191445",  // navy on green keeps text readable (white on this green is too faint)
    highlight: "#FDC025",    // Alta yellow: highlights and badges
    heroBg: "#191445",
    heroFg: "#ffffff",
    bg: "#F6F8FB",
    fg: "#191445",
    muted: "#565656",        // body grey from the guidelines
    card: "#ffffff",
    border: "#E2E6EF",
  },
  logoUrl: "/brands/altaschool/logo.png",
  logoDarkUrl: "/brands/altaschool/logo-white.png",
  iconUrl: "/brands/altaschool/icon.png",
  faviconUrl: "/brands/altaschool/favicon.png",
  appleTouchIconUrl: "/brands/altaschool/apple-touch-icon.png",
  ogImageUrl: "/brands/altaschool/og.png",
  // Brand font is Proxima Nova (licensed). Figtree is the closest free match; add an Adobe Fonts kit in fontCssUrl to use the real one.
  font: "Figtree",
  headingFont: "Figtree",
  radius: 10,
  gradient: ["#22ACD1", "#08C191"],
  tagline: "Creating Builders for an AI World",
  heroVideoUrl: "https://www.youtube.com/watch?v=64gpl6Nd1-w", // Hackwarts'26 aftermovie (ALTA Pune)
};

/** Alta School of Technology contact details, footer links and certificate signatory. */
export const ALTA_SETTINGS = {
  website: "https://www.altaschool.tech",
  supportEmail: "connect@altaschool.tech",
  phone: "+91-7065333888",
  address: "SCO 27, AIHP (Highway Side), Institutional Area, Sector 32, Gurugram, Haryana 122001",
  linkedinOrgUrl: "https://www.linkedin.com/company/alta-school-of-technology",
  social: {
    instagram: "https://www.instagram.com/alta.school.of.technology",
    linkedin: "https://www.linkedin.com/company/alta-school-of-technology",
    youtube: "https://www.youtube.com/@AltaSchoolofTechnology",
  },
  signatories: [{ name: "Ashish Munjal", title: "Founder" }],
  hashtags: ["AltaSchoolOfTechnology", "AltaHacks", "TechEducation"],
};

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
  parentEventId: z.string().optional(),
  categoryId: z.string().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  pageSections: z.array(z.object({ id: z.string(), title: z.string(), html: z.string(), icon: z.string().optional() })).optional(),
  feeAmount: z.number().int().min(0).optional(),
  currency: z.string().length(3).default("INR"),
  feeType: z.enum(FEE_TYPES).default("PER_PERSON"),
  earlyBirdAmount: z.number().int().min(0).optional(),
  earlyBirdEndsAt: z.coerce.date().optional(),
  submissionsOpenAt: z.coerce.date().optional(),
  submissionsCloseAt: z.coerce.date().optional(),
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

// ───────── Registration (individual or as a team, free or paid) ─────────


export const teamMemberInputSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().optional(),
});

export const registerInputSchema = z.object({
  answers: z.record(z.unknown()).default({}),
  /** Hackathons: the leader registers the whole team in one go. The caller is the leader. */
  team: z.object({
    name: z.string().trim().min(2).max(60),
    trackId: z.string().optional(),
    problemStatementId: z.string().optional(),
    members: z.array(teamMemberInputSchema).default([]),
  }).optional(),
  couponCode: z.string().trim().optional(),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

/** Format paise as "₹1,499" */
export function formatMoney(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}

// ───────── Judging library (built-in; brands add their own as JudgingPreset rows) ─────────

export interface CriterionPreset { name: string; description: string; maxScore: number; weight: number; category: string }

export const DEFAULT_CRITERIA_LIBRARY: CriterionPreset[] = [
  { name: "Innovation", description: "How new or creative is the idea?", maxScore: 10, weight: 1, category: "Idea" },
  { name: "Problem understanding", description: "Is the problem real, clear and well researched?", maxScore: 10, weight: 1, category: "Idea" },
  { name: "Technical complexity", description: "Depth and difficulty of what was built", maxScore: 10, weight: 1, category: "Technical" },
  { name: "Code quality", description: "Structure, readability and use of version control", maxScore: 10, weight: 1, category: "Technical" },
  { name: "Working demo", description: "Does the prototype actually work end to end?", maxScore: 10, weight: 1, category: "Technical" },
  { name: "Use of technology", description: "Right tools, APIs and AI used well", maxScore: 10, weight: 1, category: "Technical" },
  { name: "Design and UX", description: "Is it easy and pleasant to use?", maxScore: 10, weight: 1, category: "Product" },
  { name: "Completeness", description: "How much of the plan was delivered", maxScore: 10, weight: 1, category: "Product" },
  { name: "Impact", description: "Who benefits and how much?", maxScore: 10, weight: 1, category: "Business" },
  { name: "Feasibility and scalability", description: "Can it be built out and grow?", maxScore: 10, weight: 1, category: "Business" },
  { name: "Business model", description: "Revenue, market size and go-to-market", maxScore: 10, weight: 1, category: "Business" },
  { name: "Presentation", description: "Clarity of the pitch and answers to questions", maxScore: 10, weight: 1, category: "Pitch" },
  { name: "Teamwork", description: "Every member contributed and the team worked well together", maxScore: 10, weight: 1, category: "Pitch" },
  { name: "Relevance to problem statement", description: "How closely the solution fits the chosen problem", maxScore: 10, weight: 1, category: "Idea" },
];

export const DEFAULT_JUDGE_COMMENTS: { text: string; category: "Positive" | "Improve" }[] = [
  { text: "Strong, working demo", category: "Positive" },
  { text: "Very original idea", category: "Positive" },
  { text: "Clear, confident presentation", category: "Positive" },
  { text: "Clean, well-structured code", category: "Positive" },
  { text: "Real user impact", category: "Positive" },
  { text: "Great teamwork", category: "Positive" },
  { text: "Good use of AI / APIs", category: "Positive" },
  { text: "Define the problem more clearly", category: "Improve" },
  { text: "Demo was incomplete", category: "Improve" },
  { text: "Focus on fewer features and finish them", category: "Improve" },
  { text: "Validate the idea with real users", category: "Improve" },
  { text: "Explain the business model", category: "Improve" },
  { text: "Improve the UI / UX", category: "Improve" },
  { text: "Add a README and setup steps to the repo", category: "Improve" },
];

/** Default judging checks an admin can start from. */
export const DEFAULT_ROUND_NAMES = ["First cut", "Second check", "Third check", "Final"] as const;

// ───────── Page sections (rich text, written by admins) ─────────

export interface PageSection { id: string; title: string; html: string; icon?: string }

export const PAGE_SECTION_TEMPLATES: Record<string, { title: string; html: string }[]> = {
  HACKATHON: [
    { title: "Eligibility", html: "<ul><li>Open to all students</li><li>Teams of 2–4</li></ul>" },
    { title: "Timeline", html: "<ul><li><strong>Registrations close:</strong> …</li><li><strong>Problem statements released:</strong> …</li><li><strong>Submission deadline:</strong> …</li><li><strong>Results:</strong> …</li></ul>" },
    { title: "Prizes", html: "<ul><li>🥇 Winner: …</li><li>🥈 Runner-up: …</li><li>🥉 Second runner-up: …</li></ul>" },
    { title: "Rules", html: "<ol><li>All code must be written during the hackathon.</li><li>Submit a public GitHub repo and a demo video.</li></ol>" },
    { title: "Judging", html: "<p>Teams are judged in rounds on the parameters below.</p>" },
  ],
  COMPETITION: [
    { title: "Eligibility", html: "" }, { title: "Rules", html: "" }, { title: "Prizes", html: "" },
  ],
  INDUSTRY_SEMINAR: [
    { title: "About the speaker", html: "" }, { title: "What you'll learn", html: "<ul><li>…</li></ul>" }, { title: "Agenda", html: "" },
  ],
  CODING_CONTEST: [
    { title: "Rules", html: "<ol><li>Individual participation.</li><li>Any language allowed.</li></ol>" },
    { title: "Scoring", html: "" }, { title: "Prizes", html: "" },
  ],
  QUIZ: [{ title: "Format and rounds", html: "" }, { title: "Rules", html: "" }, { title: "Prizes", html: "" }],
  WORKSHOP: [{ title: "What you'll learn", html: "" }, { title: "Prerequisites", html: "" }, { title: "Agenda", html: "" }],
  SEMINAR: [{ title: "About the speaker", html: "" }, { title: "Agenda", html: "" }],
  TECH_FEST: [
    { title: "Highlights", html: "" }, { title: "Schedule", html: "" }, { title: "Prizes", html: "" },
  ],
};

// ───────── Event families (how the type picker and filters group event types) ─────────

export const EVENT_FAMILY_KEYS = ["TALKS", "LEARNING", "COMPETITIONS", "COMMUNITY", "FESTS"] as const;
export type EventFamily = (typeof EVENT_FAMILY_KEYS)[number];

export interface EventFamilyInfo {
  key: EventFamily;
  label: string;
  description: string;
  /** lucide icon name */
  icon: string;
  types: EventType[];
}

export const EVENT_FAMILIES: EventFamilyInfo[] = [
  {
    key: "TALKS", label: "Talks & sessions", icon: "Mic",
    description: "Someone comes and speaks: seminars, guest lectures, panels, webinars, conferences",
    types: ["SEMINAR", "INDUSTRY_SEMINAR", "GUEST_LECTURE", "PANEL_DISCUSSION", "WEBINAR", "CONFERENCE"],
  },
  {
    key: "LEARNING", label: "Hands-on learning", icon: "Wrench",
    description: "Participants learn by doing: workshops, bootcamps, industry visits",
    types: ["WORKSHOP", "BOOTCAMP", "INDUSTRY_VISIT"],
  },
  {
    key: "COMPETITIONS", label: "Competitions", icon: "Trophy",
    description: "Teams or individuals compete and are judged: hackathons, contests, pitches, quizzes, sports",
    types: ["HACKATHON", "CODING_CONTEST", "COMPETITION", "STARTUP_PITCH", "QUIZ", "SPORTS"],
  },
  {
    key: "COMMUNITY", label: "Community & career", icon: "Users",
    description: "Meet people and build careers: entrepreneurship meets, meetups, career fairs, alumni meets, orientation",
    types: ["ENTREPRENEURSHIP", "MEETUP", "CAREER_FAIR", "ALUMNI_MEET", "ORIENTATION"],
  },
  {
    key: "FESTS", label: "Fests", icon: "PartyPopper",
    description: "Big events that hold other events inside them: tech fests, cultural fests",
    types: ["TECH_FEST", "CULTURAL", "OTHER"],
  },
];

const FAMILY_BY_TYPE = new Map<EventType, EventFamily>(EVENT_FAMILIES.flatMap((f) => f.types.map((t) => [t, f.key] as const)));

/** The family an event type belongs to. */
export function familyOf(type: EventType): EventFamily {
  return FAMILY_BY_TYPE.get(type) ?? "FESTS";
}

/** One-line hint per type for the type picker. */
export const EVENT_TYPE_HINTS: Partial<Record<EventType, string>> = {
  SEMINAR: "A talk on a topic, one or more speakers",
  INDUSTRY_SEMINAR: "Industry expert talks about real-world practice",
  GUEST_LECTURE: "A guest teaches a class-style session",
  PANEL_DISCUSSION: "Several guests discuss with a moderator",
  WEBINAR: "Online talk with a meeting link",
  CONFERENCE: "Many talks across one or more days",
  WORKSHOP: "Hands-on session with a trainer",
  BOOTCAMP: "Multi-day intensive learning",
  INDUSTRY_VISIT: "Students visit a company or site",
  HACKATHON: "Teams build projects, judged in rounds",
  CODING_CONTEST: "Individual coding problems, scored",
  COMPETITION: "Any judged competition",
  STARTUP_PITCH: "Founders pitch to judges or investors",
  QUIZ: "Quiz rounds, individual or teams",
  SPORTS: "Matches and tournaments",
  ENTREPRENEURSHIP: "Founders, investors and startup sessions",
  MEETUP: "Informal community gathering",
  CAREER_FAIR: "Companies meet students for jobs/internships",
  ALUMNI_MEET: "Alumni reconnect with the institution",
  ORIENTATION: "Welcome session for new students",
  TECH_FEST: "Umbrella event with many sub-events",
  CULTURAL: "Cultural fest or performances",
  OTHER: "Anything else",
};

/** Tags offered in the tag picker (brands can type their own too). */
export const SUGGESTED_TAGS = [
  "AI", "Web development", "Data science", "Cybersecurity", "Cloud", "Product", "Design", "Startups",
  "Placement", "Internship", "Industry", "Alumni", "First-year", "Women in tech", "Open source", "Online", "Free",
] as const;
