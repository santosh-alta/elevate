// Elevate API client — follows docs/API.md. All endpoint calls and response
// normalisation live here, so contract changes only touch this file.
import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import type { ThemeInput } from "./theme";

export interface BrandConfig {
  slug: string;
  appName: string;
  bundleId: string;
  scheme: string;
  iconColor: string;
  apiUrl: string;
  webUrl?: string;
  /** Built-in theme used before /v1/tenant loads (and offline); the tenant theme wins */
  theme?: ThemeInput;
}

export const brand: BrandConfig = (Constants.expoConfig?.extra?.brand as BrandConfig) ?? {
  slug: "altaschool",
  appName: "Events",
  bundleId: "app.elevate",
  scheme: "elevate",
  iconColor: "#4f46e5",
  apiUrl: "http://localhost:4000",
};

export const API_BASE = `${brand.apiUrl.replace(/\/$/, "")}/v1`;
export const WEB_BASE = brand.webUrl?.replace(/\/$/, "") ?? null;

// ───────── Event types (mirrors packages/shared EVENT_TYPE_LABELS) ─────────

export const EVENT_TYPE_LABELS: Record<string, string> = {
  HACKATHON: "Hackathon",
  SEMINAR: "Seminar",
  WORKSHOP: "Workshop",
  GUEST_LECTURE: "Guest lecture",
  COMPETITION: "Competition",
  BOOTCAMP: "Bootcamp",
  WEBINAR: "Webinar",
  CULTURAL: "Cultural",
  ENTREPRENEURSHIP: "Entrepreneurship",
  STARTUP_PITCH: "Startup pitch",
  CONFERENCE: "Conference",
  PANEL_DISCUSSION: "Panel discussion",
  MEETUP: "Meetup",
  CAREER_FAIR: "Career fair",
  INDUSTRY_VISIT: "Industry visit",
  ORIENTATION: "Orientation",
  ALUMNI_MEET: "Alumni meet",
  SPORTS: "Sports",
  TECH_FEST: "Tech fest",
  INDUSTRY_SEMINAR: "Industry seminar",
  CODING_CONTEST: "Coding contest",
  QUIZ: "Quiz",
  OTHER: "Other",
};

export function eventTypeLabel(type?: string | null): string {
  if (!type) return "";
  return EVENT_TYPE_LABELS[type] ?? type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Display label of an event: the brand's own type name (e.g. "Founder Friday"), else the built-in type label. */
export function eventLabel(e: { type: string; category?: EventCategoryRef | null }): string {
  return e.category?.name ?? eventTypeLabel(e.type);
}

// ───────── Event families (mirrors packages/shared EVENT_FAMILIES) ─────────

export type EventFamily = "TALKS" | "LEARNING" | "COMPETITIONS" | "COMMUNITY" | "FESTS";

export const EVENT_FAMILIES: { key: EventFamily; label: string }[] = [
  { key: "TALKS", label: "Talks & sessions" },
  { key: "LEARNING", label: "Hands-on learning" },
  { key: "COMPETITIONS", label: "Competitions" },
  { key: "COMMUNITY", label: "Community & career" },
  { key: "FESTS", label: "Fests" },
];

/** A brand's own event type, as embedded in event payloads. */
export interface EventCategoryRef {
  id: string;
  name: string;
  icon?: string | null;
}

// ───────── Token storage ─────────

const TOKEN_KEY = `elevate_token_${brand.slug}`;

export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === "web") return void globalThis.localStorage?.setItem(TOKEN_KEY, token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    if (Platform.OS === "web") return void globalThis.localStorage?.removeItem(TOKEN_KEY);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

let cachedToken: string | null = null;
export function setAuthToken(token: string | null) {
  cachedToken = token;
}

// ───────── Core request ─────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Tenant": brand.slug,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && cachedToken) headers.Authorization = `Bearer ${cachedToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", `Can't reach the server (${brand.apiUrl}). Check your connection.`);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && cachedToken) onUnauthorized?.();
    throw new ApiError(
      res.status,
      data?.error ?? "error",
      data?.message ?? data?.error ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

/** Accepts `[...]`, `{ items: [...] }`, `{ data: [...] }` or `{ <key>: [...] }`. */
function list<T>(data: any, key?: string): T[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  if (key && Array.isArray(data[key])) return data[key];
  for (const k of ["items", "data", "results"]) if (Array.isArray(data[k])) return data[k];
  return [];
}

// ───────── Types ─────────

export type Role =
  | "BRAND_ADMIN"
  | "CAMPUS_ADMIN"
  | "EVENT_MANAGER"
  | "JUDGE"
  | "VOLUNTEER"
  | "SPEAKER"
  | "STUDENT";

export interface Campus {
  id: string;
  name: string;
  code: string;
  city?: string | null;
}

export interface CampusCard {
  id: string;
  code: string;
  slug?: string;
  name: string;
  city?: string | null;
  photoUrl?: string | null;
  details?: { region?: string; about?: string; [k: string]: unknown } | null;
  upcoming: number;
  past: number;
}

export interface CampusDetail extends Omit<CampusCard, "upcoming" | "past"> {
  address?: string | null;
  stats: { eventsHeld: number; participants: number; hackathons: number };
  eventPhotos: { id: string; url: string; caption?: string | null; eventSlug: string; eventTitle: string }[];
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  theme: ThemeInput;
  settings: { hashtags?: string[]; linkedinOrgUrl?: string; [k: string]: unknown };
  campuses: Campus[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  profileCompletedAt?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  leetcodeUrl?: string | null;
  gfgUrl?: string | null;
  codechefUrl?: string | null;
  hackerrankUrl?: string | null;
  codeforcesUrl?: string | null;
  college?: string | null;
  degree?: string | null;
  graduationYear?: number | null;
  city?: string | null;
  isPlatformAdmin?: boolean;
}

/** An outside hackathon on the calendar (Unstop, Devfolio, MLH, Devpost or added by the team). */
export interface ExternalEvent {
  id: string; source: string; sourceLabel: string; title: string; organizer?: string | null; url: string;
  imageUrl?: string | null; coverUrl?: string | null; summary?: string | null; teamSize?: string | null;
  startsAt: string; endsAt: string; registrationEndsAt?: string | null; mode: string; location?: string | null;
  prize?: string | null; participants?: number | null; tags: string[]; major: boolean; kind?: string;
}
export interface CalendarEvent {
  id: string; slug: string; title: string; type: string; startsAt: string; endsAt: string; mode: string; status: string;
  venue?: string | null; category?: EventCategoryRef | null; campuses?: { campus: { name: string; city?: string | null } }[];
}
export interface AttendResult { status: "checked_in" | "already" | string; name?: string; checkedInAt?: string; event?: { title: string; slug?: string } }
export interface Standings {
  published: boolean; hidden?: boolean; showScores?: boolean; totalTeams?: number;
  round: { id: string; name: string } | null; rounds: { id: string; name: string }[];
  rows: { rank: number | null; teamId: string; teamName: string; projectTitle: string | null; award: string | null; members: { name: string; avatarUrl: string | null }[]; score: number | null }[];
}
export interface ChatInfo { enabled: boolean; signedIn: boolean; brand: string; suggestions: string[]; usage: { used: number; limit: number; remaining: number } | null }
export interface FeedbackInput {
  rating: number; nps?: number; comment?: string; liked?: string; improve?: string;
  aspects?: { content?: number; speakers?: number; organisation?: number; venue?: number };
}

export interface Membership {
  id: string;
  role: Role;
  campusId?: string | null;
  campus?: Campus | null;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
  description?: string | null;
  type: string;
  scope: string;
  mode: "ONLINE" | "OFFLINE" | "HYBRID";
  status: string;
  coverImageUrl?: string | null;
  venue?: string | null;
  meetingUrl?: string | null;
  startsAt: string;
  endsAt: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  capacity?: number | null;
  modules?: Record<string, boolean>;
  driveFolderUrl?: string | null;
  campuses?: { campus?: Campus; name?: string; id?: string }[];
  // v1.3
  family?: EventFamily;
  category?: EventCategoryRef | null;
  tags?: string[];
  _count?: { registrations?: number; teams?: number };
  counts?: { registrations?: number; teams?: number; [k: string]: number | undefined };
}

export interface EventGuestPublic {
  id: string;
  name: string;
  designation?: string | null;
  organization?: string | null;
  photoUrl?: string | null;
  role?: string;
  talkTitle?: string | null;
  sessionAt?: string | null;
  linkedinUrl?: string | null;
  profileId?: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl?: string | null;
  website?: string | null;
  tier?: string;
  sortOrder?: number;
}

export interface Faq {
  q: string;
  a: string;
}

export interface MediaItem {
  id: string;
  kind: string;
  url: string;
  title?: string | null;
  caption?: string | null;
  isHighlight?: boolean;
  createdAt?: string;
}

export interface EventDetail extends EventSummary {
  sessions?: { id: string; title: string; speaker?: string | null; startsAt: string; endsAt: string; location?: string | null }[];
  guests?: EventGuestPublic[];
  sponsors?: Sponsor[];
  faqs?: Faq[];
  livestreamUrl?: string | null;
  venueMapUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  gallery?: MediaItem[];
  // v1.2
  config?: Record<string, unknown> | null;
  fee: EventFee | null;
  pageSections: PageSection[];
  problemStatements: ProblemStatement[];
  rubricPublic: PublicCriterion[];
  rounds: JudgingRound[];
  parentEvent: { slug: string; title: string; id?: string } | null;
  subEvents: SubEvent[];
  winners: Winner[];
  resultsPublishedAt?: string | null;
  submissionsOpenAt?: string | null;
  submissionsCloseAt?: string | null;
  myTeam: Team | null;
  myPayment: Payment | null;
  myRegistration?: Registration | null;
}

/** Money is in the smallest currency unit (paise). */
export interface EventFee {
  amount: number;
  currency: string;
  feeType: "PER_PERSON" | "PER_TEAM";
  earlyBirdAmount?: number | null;
  earlyBirdEndsAt?: string | null;
  currentAmount: number;
}

export interface PageSection {
  id: string;
  title: string;
  html: string;
  icon?: string | null;
}

export interface LinkItem {
  label: string;
  url: string;
  kind?: string | null;
}

export interface ProblemStatement {
  id: string;
  code?: string | null;
  title: string;
  html?: string | null;
  trackId?: string | null;
  difficulty?: string | null;
  sponsorName?: string | null;
  attachments: LinkItem[];
  releaseAt?: string | null;
}

export interface PublicCriterion {
  name: string;
  description?: string | null;
  maxScore: number;
  weight: number;
  roundName?: string | null;
}

export interface SubEvent {
  id: string;
  slug: string;
  title: string;
  type: string;
  startsAt: string;
  mode?: string;
  coverImageUrl?: string | null;
  status: string;
  family?: EventFamily;
  category?: EventCategoryRef | null;
  tags?: string[];
}

export interface Winner {
  teamId: string;
  teamName: string;
  award?: string | null;
  rank?: number | null;
  projectTitle?: string | null;
  members: { name: string; avatarUrl?: string | null }[];
}

export type PaymentStatus = "CREATED" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | string;

export interface Payment {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  receiptNo?: string | null;
  provider?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
}

export interface TeamMemberInfo {
  userId?: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  isLeader: boolean;
}

export interface TeamFeedback {
  roundName: string;
  averageScore?: number | null;
  comments: string[];
  tags: string[];
}

export interface Team {
  id: string;
  name: string;
  eventId?: string;
  inviteCode?: string | null;
  trackId?: string | null;
  projectTitle?: string | null;
  projectSummary?: string | null;
  repoUrl?: string | null;
  demoUrl?: string | null;
  deckUrl?: string | null;
  videoUrl?: string | null;
  attachments: LinkItem[];
  techStack: string[];
  submittedAt?: string | null;
  problemStatement?: { id: string; code?: string | null; title: string; html?: string | null } | null;
  members: TeamMemberInfo[];
  /** Payment status of the team's registration fee, when the event is paid. */
  paymentStatus?: PaymentStatus | null;
  payment?: Payment | null;
  feedback: TeamFeedback[];
  award?: string | null;
  rank?: number | null;
}

export interface AppNotification {
  id: string;
  template: string;
  subject: string;
  body: string;
  eventId?: string | null;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export interface UploadResult {
  url: string;
  key?: string;
  media?: MediaItem;
}

/** A file picked from the camera or gallery. */
export interface LocalFile {
  uri: string;
  name: string;
  mimeType: string;
}

export interface Registration {
  id: string;
  eventId: string;
  status: string;
  ticketCode: string;
  checkedInAt?: string | null;
  createdAt: string;
  event?: EventSummary;
  paymentId?: string | null;
  payment?: Payment | null;
  teamId?: string | null;
}

export interface RegisterResult {
  registration: Registration;
  team?: Team | null;
  payment?: Payment | null;
}

export interface Certificate {
  id: string;
  serial: string;
  type: string;
  recipientName: string;
  detail?: string | null;
  pdfUrl?: string | null;
  issuedAt: string;
  event?: { id: string; title: string; slug?: string };
}

export interface LinkedInPost {
  id: string;
  eventId: string;
  draft: string;
  status: "SUGGESTED" | "EDITED" | "POSTED" | "SKIPPED";
  postUrl?: string | null;
  postedAt?: string | null;
  generatedBy?: string;
  event?: { id: string; title: string };
}

export interface RubricCriterion {
  id: string;
  name: string;
  description?: string | null;
  maxScore: number;
  weight: number;
  sortOrder?: number;
  /** null = used in every round */
  roundId?: string | null;
}

export interface JudgingRound {
  id: string;
  name: string;
  description?: string | null;
  isOpen?: boolean;
  closedAt?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  sortOrder?: number;
}

export type RoundState = "open" | "closed" | "upcoming";

export function roundState(r: JudgingRound | undefined | null): RoundState {
  if (!r) return "upcoming";
  if (r.isOpen) return "open";
  if (r.closedAt) return "closed";
  if (r.closesAt && new Date(r.closesAt).getTime() < Date.now()) return "closed";
  return "upcoming";
}

export interface JudgeComment {
  text: string;
  category?: string | null;
}

export interface MyReview {
  comment?: string | null;
  tags: string[];
  recommend?: boolean | null;
  submittedAt?: string | null;
}

export interface JudgeEvent extends EventSummary {
  rounds?: JudgingRound[];
  currentRoundId?: string | null;
  assignedTeams?: number;
  submittedTeams?: number;
}

export interface MyScore {
  criterionId: string;
  value: number;
  comment?: string | null;
  submittedAt?: string | null;
}

export type JudgeTeamStatus = "PENDING" | "DRAFT" | "SUBMITTED";

export interface JudgeTeam {
  id: string;
  name: string;
  trackId?: string | null;
  projectTitle?: string | null;
  projectSummary?: string | null;
  repoUrl?: string | null;
  demoUrl?: string | null;
  deckUrl?: string | null;
  videoUrl?: string | null;
  submittedAt?: string | null;
  members: TeamMemberInfo[];
  attachments: LinkItem[];
  techStack: string[];
  problemStatement?: Team["problemStatement"];
  myScores: MyScore[];
  myReview: MyReview | null;
  status: JudgeTeamStatus;
}

/** `GET /judge/events/:id?roundId=` — one round's teams, criteria and suggested remarks. */
export interface JudgePayload {
  event: { id: string; title: string; slug?: string; status?: string } | null;
  round: JudgingRound | null;
  rounds: JudgingRound[];
  criteria: RubricCriterion[];
  comments: JudgeComment[];
  teams: JudgeTeam[];
}

export interface CheckinResult {
  registration: Registration;
  user: Pick<User, "id" | "name" | "email">;
  alreadyCheckedIn: boolean;
}

export interface EventTask {
  id: string;
  phase: "PRE" | "DURING" | "POST";
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "SKIPPED";
  dueAt?: string | null;
  assignee?: { name: string } | null;
}

// ───────── Normalisers ─────────

const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);

function normaliseLinks(v: any): LinkItem[] {
  return asArray(v)
    .map((a: any) =>
      typeof a === "string"
        ? { label: a, url: a }
        : { label: String(a?.label ?? a?.name ?? a?.url ?? "Link"), url: String(a?.url ?? ""), kind: a?.kind ?? null },
    )
    .filter((a) => /^(https?:|\/)/.test(a.url))
    .map((a) => ({ ...a, url: absoluteUrl(a.url) }));
}

function normaliseMember(m: any): TeamMemberInfo {
  return {
    userId: m?.userId ?? m?.user?.id ?? m?.id,
    name: String(m?.user?.name ?? m?.name ?? m?.email ?? "Member"),
    email: m?.user?.email ?? m?.email ?? null,
    avatarUrl: m?.user?.avatarUrl ?? m?.avatarUrl ?? null,
    isLeader: !!m?.isLeader,
  };
}

function normaliseProblem(p: any): ProblemStatement {
  return { ...p, title: String(p?.title ?? "Problem statement"), attachments: normaliseLinks(p?.attachments) };
}

function normalisePayment(p: any): Payment | null {
  if (!p || typeof p !== "object" || !p.id) return null;
  return { ...p, amount: Number(p.amount ?? 0), currency: p.currency ?? "INR", status: p.status ?? "CREATED" };
}

function normaliseTeam(t: any): Team {
  const ps = t?.problemStatement;
  return {
    ...t,
    name: String(t?.name ?? "Team"),
    attachments: normaliseLinks(t?.attachments),
    techStack: asArray(t?.techStack).map(String),
    members: asArray(t?.members).map(normaliseMember).sort((a, b) => Number(b.isLeader) - Number(a.isLeader)),
    problemStatement: ps && ps.title ? { id: ps.id, code: ps.code ?? null, title: ps.title, html: ps.html ?? null } : null,
    payment: normalisePayment(t?.payment),
    paymentStatus: t?.paymentStatus ?? t?.payment?.status ?? null,
    feedback: asArray(t?.feedback).map((f: any) => ({
      roundName: String(f?.roundName ?? "Round"),
      averageScore: typeof f?.averageScore === "number" ? f.averageScore : null,
      comments: asArray(f?.comments).map(String).filter(Boolean),
      tags: asArray(f?.tags).map(String).filter(Boolean),
    })),
  };
}

function normaliseReview(r: any): MyReview | null {
  if (!r || typeof r !== "object") return null;
  return {
    comment: r.comment ?? null,
    tags: asArray(r.tags).map(String),
    recommend: typeof r.recommend === "boolean" ? r.recommend : null,
    submittedAt: r.submittedAt ?? null,
  };
}

function normaliseJudgeTeam(t: any): JudgeTeam {
  const base = normaliseTeam(t);
  const myScores: MyScore[] = list<MyScore>(t.myScores ?? t.scores ?? []);
  const myReview = normaliseReview(t.myReview ?? t.review);
  let status: JudgeTeamStatus = t.status ?? t.myStatus;
  if (status !== "PENDING" && status !== "DRAFT" && status !== "SUBMITTED") {
    status =
      myScores.length === 0 && !myReview
        ? "PENDING"
        : myScores.some((s) => s.submittedAt) || myReview?.submittedAt
          ? "SUBMITTED"
          : "DRAFT";
  }
  return { ...base, myScores, myReview, status } as JudgeTeam;
}

/** Built-in suggested remarks (copied from packages/shared DEFAULT_JUDGE_COMMENTS) — used for categories and as a fallback. */
export const DEFAULT_JUDGE_COMMENTS: JudgeComment[] = [
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

function normaliseComments(v: any): JudgeComment[] {
  if (!Array.isArray(v)) return DEFAULT_JUDGE_COMMENTS;
  const known = new Map(DEFAULT_JUDGE_COMMENTS.map((c) => [c.text.toLowerCase(), c.category]));
  const seen = new Set<string>();
  const out: JudgeComment[] = [];
  for (const c of v) {
    const text = typeof c === "string" ? c : String(c?.text ?? c?.name ?? "");
    if (!text.trim() || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const category = (typeof c === "object" ? c?.category : null) ?? known.get(text.toLowerCase()) ?? null;
    out.push({ text, category });
  }
  return out;
}

function normaliseJudgePayload(data: any, roundId?: string): JudgePayload {
  const d = data && !Array.isArray(data) ? data : { teams: data };
  const rounds: JudgingRound[] = asArray(d.rounds).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const round: JudgingRound | null =
    d.round ?? rounds.find((r) => r.id === roundId) ?? rounds.find((r) => r.isOpen) ?? rounds[0] ?? null;
  const criteria: RubricCriterion[] = asArray(d.criteria ?? d.rubric)
    .filter((c: any) => !c.roundId || !round || c.roundId === round.id)
    .map((c: any) => ({ ...c, maxScore: Number(c.maxScore ?? 10), weight: Number(c.weight ?? 1) }))
    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return {
    event: d.event ?? null,
    round,
    rounds,
    criteria,
    comments: normaliseComments(d.comments),
    teams: list<any>(d, "teams").map(normaliseJudgeTeam),
  };
}

/** Campus photos are full URLs or paths on the brand website. */
function campusPhoto(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return WEB_BASE && url.startsWith("/") ? `${WEB_BASE}${url}` : absoluteUrl(url);
}

export function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const root = brand.apiUrl.replace(/\/$/, "");
  if (url.startsWith("/v1/")) return `${root}${url}`;
  if (url.startsWith("/files/")) return `${API_BASE}${url}`;
  return url.startsWith("/") ? `${root}${url}` : url;
}

function normaliseMedia(m: any): MediaItem {
  return { ...m, url: absoluteUrl(String(m.url ?? "")) };
}

function normaliseFee(e: any): EventFee | null {
  const f = e.fee && typeof e.fee === "object" ? e.fee : null;
  const amount = Number(f?.amount ?? e.feeAmount ?? 0);
  if (!amount) return null;
  const earlyBirdAmount = f?.earlyBirdAmount ?? e.earlyBirdAmount ?? null;
  const earlyBirdEndsAt = f?.earlyBirdEndsAt ?? e.earlyBirdEndsAt ?? null;
  const earlyActive = earlyBirdAmount != null && earlyBirdEndsAt && new Date(earlyBirdEndsAt).getTime() > Date.now();
  return {
    amount,
    currency: f?.currency ?? e.currency ?? "INR",
    feeType: (f?.feeType ?? e.feeType ?? "PER_PERSON") === "PER_TEAM" ? "PER_TEAM" : "PER_PERSON",
    earlyBirdAmount,
    earlyBirdEndsAt,
    currentAmount: Number(f?.currentAmount ?? (earlyActive ? earlyBirdAmount : amount)),
  };
}

function normaliseEvent(e: any): EventDetail {
  const myTeam = e.myTeam ? normaliseTeam(e.myTeam) : null;
  return {
    ...e,
    fee: normaliseFee(e),
    pageSections: asArray(e.pageSections)
      .filter((s: any) => s && (s.title || s.html))
      .map((s: any, i: number) => ({ id: String(s.id ?? i), title: String(s.title ?? ""), html: String(s.html ?? ""), icon: s.icon ?? null })),
    problemStatements: asArray(e.problemStatements).map(normaliseProblem),
    rubricPublic: asArray(e.rubricPublic),
    rounds: asArray(e.rounds),
    parentEvent: e.parentEvent ?? null,
    subEvents: asArray(e.subEvents).map((s: any) => ({ ...s, coverImageUrl: s.coverImageUrl ? absoluteUrl(s.coverImageUrl) : null })),
    winners: asArray(e.winners)
      .map((w: any) => ({
        ...w,
        teamName: String(w.teamName ?? w.team?.name ?? "Team"),
        members: asArray(w.members).map((m: any) => ({ name: String(m?.name ?? m?.user?.name ?? ""), avatarUrl: m?.avatarUrl ?? null })),
      }))
      .sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99)),
    myTeam,
    myPayment: normalisePayment(e.myPayment),
    guests: asArray(e.guests).map((g: any) => ({ ...g, photoUrl: g.photoUrl ? absoluteUrl(g.photoUrl) : g.photoUrl })),
    sponsors: asArray(e.sponsors)
      .map((s: any) => ({ ...s, logoUrl: s.logoUrl ? absoluteUrl(s.logoUrl) : s.logoUrl }))
      .sort((a: Sponsor, b: Sponsor) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    faqs: asArray(e.faqs).filter((f: any) => f && f.q),
    gallery: asArray(e.gallery).map(normaliseMedia),
    category: e.category ?? null,
    tags: asArray(e.tags).map(String),
  };
}

/**
 * Multipart upload with progress. Uses XMLHttpRequest because fetch has no upload progress.
 * Fields: file (+ optional eventId, kind, caption) → POST /uploads.
 */
async function uploadFile(
  file: LocalFile,
  fields: Record<string, string | undefined>,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    // React Native's FormData accepts { uri, name, type } for files.
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as any);
  }
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") form.append(k, v);

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/uploads`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Tenant", brand.slug);
    if (cachedToken) xhr.setRequestHeader("Authorization", `Bearer ${cachedToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, "network", `Can't reach the server (${brand.apiUrl}).`));
    xhr.onload = () => {
      let data: any = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        onProgress?.(1);
        resolve({ ...data, url: absoluteUrl(String(data.url ?? "")), media: data.media ? normaliseMedia(data.media) : undefined });
      } else {
        if (xhr.status === 401 && cachedToken) onUnauthorized?.();
        reject(new ApiError(xhr.status, data?.error ?? "error", data?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.send(form);
  });
}

/**
 * Downloads a file (optionally with the auth header) into the cache and hands it to the system viewer
 * (Quick Look on iOS, ACTION_VIEW on Android) — from there the user can save or share it.
 * On web, or if the native preview is unavailable, it opens the URL in the browser instead.
 */
async function openRemoteFile(url: string, name: string, auth: boolean): Promise<void> {
  if (Platform.OS === "web") {
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  const headers: Record<string, string> = { "X-Tenant": brand.slug };
  if (auth && cachedToken) headers.Authorization = `Bearer ${cachedToken}`;
  const dir = new Directory(Paths.cache, "elevate-downloads");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  let file: File;
  try {
    file = await File.downloadFileAsync(url, new File(dir, safeName), { headers, idempotent: true });
  } catch (e: any) {
    const status = Number(/\b(\d{3})\b/.exec(String(e?.message ?? ""))?.[1] ?? 0);
    if (status === 401 || status === 403) throw new ApiError(status, "forbidden", "You don't have access to this file.");
    if (status === 404) throw new ApiError(404, "not_found", "File not found.");
    throw new ApiError(0, "network", "Couldn't download the file. Check your connection.");
  }
  try {
    await file.preview();
  } catch {
    if (!auth) await WebBrowser.openBrowserAsync(url);
    else throw new ApiError(0, "preview", "No app on this phone can open this file.");
  }
}

/** Certificate type labels (mirrors packages/shared CERTIFICATE_TYPES). */
export const CERTIFICATE_TYPE_LABELS: Record<string, string> = {
  PARTICIPATION: "Participation",
  FINALIST: "Finalist",
  WINNER: "Winner",
  RUNNER_UP: "Runner-up",
  SPECIAL_MENTION: "Special mention",
  JUDGE: "Judge",
  SPEAKER: "Speaker",
  VOLUNTEER: "Volunteer",
  MENTOR: "Mentor",
};

export const AWARD_LABELS: Record<string, string> = {
  WINNER: "Winner",
  RUNNER_UP: "1st runner-up",
  SECOND_RUNNER_UP: "2nd runner-up",
  SPECIAL_MENTION: "Special mention",
};

/** Formats paise as "₹1,499" (mirrors packages/shared formatMoney). */
export function formatMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(amount % 100 ? 2 : 0)}`;
  }
}

// ───────── Endpoints ─────────

export const Api = {
  tenant: () => api<Tenant>("/tenant", { auth: false }),

  requestOtp: (email: string, name?: string) =>
    api<{ ok: boolean; devCode?: string }>("/auth/otp/request", {
      method: "POST",
      body: { email, ...(name ? { name } : {}) },
      auth: false,
    }),
  /** Which social sign-ins this brand has set up (public client ids, or null). */
  authProviders: () => api<{ google: string | null; github: string | null }>("/auth/providers", { auth: false }),
  /** Finish a Google/GitHub sign-in started in the browser: the handoff code plus the app's own secret. */
  redeemSignIn: (code: string, verifier: string) =>
    api<{ token: string; user: User }>("/auth/app-handoff/redeem", { method: "POST", body: { code, verifier }, auth: false }),
  verifyOtp: (email: string, code: string) =>
    api<{ token: string; user: User }>("/auth/otp/verify", { method: "POST", body: { email, code }, auth: false }),
  me: () => api<{ user: User; membership: Membership | null }>("/me"),
  updateMe: (fields: Partial<User>) => api<User>("/me", { method: "PATCH", body: fields }),
  /** Delete my account (personal details erased; past participation kept as anonymous numbers). */
  deleteAccount: () => api("/me", { method: "DELETE", body: { confirm: "DELETE" } }),
  registerPushToken: (token: string, platform: "android" | "ios") => api("/me/push-tokens", { method: "POST", body: { token, platform } }),
  unregisterPushToken: (token: string) => api("/me/push-tokens", { method: "DELETE", body: { token } }),
  /** Our events plus approved outside hackathons between two dates. */
  calendar: (from: Date, to: Date) =>
    api<{ events: CalendarEvent[]; external: ExternalEvent[] }>(`/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
  /** Swaps the short-lived code from the venue QR for a 10-minute pass. */
  attendStart: (event: string, t: string) =>
    api<{ event: { title: string; slug: string }; pass: string; needsLocation: boolean }>(`/events/${encodeURIComponent(event)}/attend/start?t=${encodeURIComponent(t)}`),
  /** Self check-in with the QR on the venue screen. */
  attend: (event: string, pass: string, coords?: { lat: number; lng: number; accuracy?: number }) =>
    api<AttendResult>(`/events/${encodeURIComponent(event)}/attend`, { method: "POST", body: { pass, ...coords } }),
  myFeedback: (eventId: string) => api<any>(`/events/${encodeURIComponent(eventId)}/feedback/mine`),
  sendFeedback: (eventId: string, body: FeedbackInput) => api(`/events/${encodeURIComponent(eventId)}/feedback`, { method: "POST", body }),
  /** Public leaderboard of an event (after results are published). */
  standings: (eventId: string, roundId?: string | null) =>
    api<Standings>(`/events/${encodeURIComponent(eventId)}/standings${roundId ? `?roundId=${encodeURIComponent(roundId)}` : ""}`),
  chatInfo: () => api<ChatInfo>("/ai/chat/info"),
  chat: (messages: { role: "user" | "assistant"; text: string }[]) =>
    api<{ reply: string; usage: ChatInfo["usage"] }>("/ai/chat", { method: "POST", body: { messages } }),

  // Events
  events: async (query = "upcoming=1") => list<EventSummary>(await api(`/events?${query}`), "events"),
  /** Upcoming events, optionally narrowed to one family (GET /events?family=). */
  /** Upcoming events; optionally one family, and/or one campus (its own events plus central ones). */
  eventsByFamily: async (family?: EventFamily | null, campusId?: string | null, campusOnly = false) =>
    list<EventSummary>(
      await api(`/events?upcoming=1${family ? `&family=${family}` : ""}${campusId ? `&campusId=${campusId}${campusOnly ? "&campusOnly=true" : ""}` : ""}`),
      "events",
    ),
  /** Campus directory: photo and counts of upcoming / past public events. */
  campuses: async () => list<CampusCard>(await api("/campuses", { auth: false })).map((c) => ({ ...c, photoUrl: campusPhoto(c.photoUrl) })),
  campus: async (code: string) => {
    const c = await api<CampusDetail>(`/campuses/${encodeURIComponent(code)}`, { auth: false });
    return { ...c, photoUrl: campusPhoto(c.photoUrl), eventPhotos: (c.eventPhotos ?? []).map((p) => ({ ...p, url: absoluteUrl(p.url) })) };
  },
  event: async (idOrSlug: string) => normaliseEvent(await api<any>(`/events/${encodeURIComponent(idOrSlug)}`)),
  calendarUrl: (idOrSlug: string) => `${API_BASE}/events/${encodeURIComponent(idOrSlug)}/calendar.ics`,
  /** Public event page on the brand's website, when the brand has one configured. */
  publicEventUrl: (slug: string) => (WEB_BASE ? `${WEB_BASE}/events/${encodeURIComponent(slug)}` : null),
  /** Free individual registration. Paid and team registrations go through the website (Razorpay checkout). */
  register: async (eventId: string, answers: Record<string, unknown> = {}): Promise<RegisterResult> => {
    const data: any = await api(`/events/${eventId}/register`, { method: "POST", body: { answers } });
    // v1.2: `{ registration, team?, payment? }`; older servers returned the registration itself.
    const registration: Registration = data?.registration ?? data;
    return { registration, team: data?.team ? normaliseTeam(data.team) : null, payment: normalisePayment(data?.payment) };
  },
  cancelRegistration: (eventId: string) => api(`/events/${eventId}/register`, { method: "DELETE" }),
  myRegistrations: async () =>
    list<any>(await api("/me/registrations"), "registrations").map(
      (r): Registration => ({ ...r, payment: normalisePayment(r.payment), paymentId: r.paymentId ?? r.payment?.id ?? null }),
    ),

  // Web hand-off (paid checkout and team editing are web-only for now)
  webUrl: (path: string) => (WEB_BASE ? `${WEB_BASE}${path}` : null),
  registerOnWebUrl: (slug: string) => (WEB_BASE ? `${WEB_BASE}/events/${encodeURIComponent(slug)}/register` : null),
  teamOnWebUrl: (slug: string) => (WEB_BASE ? `${WEB_BASE}/events/${encodeURIComponent(slug)}/team` : null),

  // Teams
  team: async (teamId: string) => normaliseTeam(await api(`/teams/${teamId}`)),
  /** The caller's team for an event (or null). */
  myTeam: async (eventId: string): Promise<Team | null> => {
    const teams = list<any>(await api(`/me/teams?eventId=${encodeURIComponent(eventId)}`), "teams");
    return teams[0] ? normaliseTeam(teams[0]) : null;
  },

  // Payments
  payment: async (paymentId: string) => {
    const data: any = await api(`/payments/${paymentId}`);
    return normalisePayment(data?.payment ?? data);
  },
  receiptUrl: (paymentId: string) => `${API_BASE}/payments/${paymentId}/receipt.pdf`,
  /** Downloads the (auth-protected) PDF receipt and opens it in the system viewer. */
  openReceipt: (paymentId: string) =>
    openRemoteFile(`${API_BASE}/payments/${paymentId}/receipt.pdf`, `receipt-${paymentId}.pdf`, true),

  // Gallery
  gallery: async (eventId: string, opts: { highlights?: boolean; cursor?: string | null } = {}) => {
    const q = new URLSearchParams();
    if (opts.highlights) q.set("highlights", "1");
    if (opts.cursor) q.set("cursor", opts.cursor);
    const data: any = await api(`/events/${eventId}/gallery${q.toString() ? `?${q}` : ""}`);
    const items = list<any>(data, "media").length ? list<any>(data, "media") : list<any>(data, "photos");
    return {
      items: items.map(normaliseMedia),
      nextCursor: (data && !Array.isArray(data) ? (data.nextCursor ?? data.cursor ?? null) : null) as string | null,
    };
  },
  /** Downloads a photo and opens the system viewer (from which it can be saved to the phone). */
  openPhoto: (url: string, name: string) => openRemoteFile(url, name, false),

  // Certificates & LinkedIn
  myCertificates: async () => list<Certificate>(await api("/me/certificates"), "certificates"),
  certificatePdfUrl: (serial: string) => `${API_BASE}/certificates/${encodeURIComponent(serial)}.pdf`,
  myLinkedIn: async (eventId?: string) =>
    list<LinkedInPost>(await api(`/me/linkedin${eventId ? `?eventId=${eventId}` : ""}`), "posts"),
  updateLinkedIn: (id: string, body: Partial<Pick<LinkedInPost, "draft" | "status" | "postUrl">>) =>
    api<LinkedInPost>(`/linkedin/${id}`, { method: "PATCH", body }),

  // Judging
  judgeEvents: async () => list<JudgeEvent>(await api("/judge/events"), "events"),
  rubric: async (eventId: string) =>
    list<RubricCriterion>(await api(`/events/${eventId}/rubric`), "criteria").sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    ),
  /**
   * One round of an event for the judge: its teams (shortlist), criteria (event-wide + round's own),
   * suggested remarks and my scores/review per team. Falls back to the v1.1 `/teams` endpoint.
   */
  judgeEvent: async (eventId: string, roundId?: string): Promise<JudgePayload> => {
    const q = roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
    try {
      return normaliseJudgePayload(await api(`/judge/events/${eventId}${q}`), roundId);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
      const data: any = await api(`/judge/events/${eventId}/teams${q}`);
      const payload = normaliseJudgePayload(data, roundId);
      if (!payload.criteria.length) payload.criteria = await Api.rubric(eventId).catch(() => []);
      return payload;
    }
  },
  saveScores: async (body: {
    roundId: string;
    teamId: string;
    scores: { criterionId: string; value: number; comment?: string }[];
    review?: { comment?: string; tags?: string[]; recommend?: boolean };
    submit: boolean;
  }) => {
    try {
      return await api("/judge/scores", { method: "POST", body });
    } catch (e) {
      // v1.1 servers only accept PUT.
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return api("/judge/scores", { method: "PUT", body });
      throw e;
    }
  },

  // Staff / volunteer
  checkin: (ticketCode: string) => api<CheckinResult>("/checkin", { method: "POST", body: { ticketCode } }),
  tasks: async (eventId: string) => list<EventTask>(await api(`/events/${eventId}/tasks`), "tasks"),
  updateTask: (taskId: string, body: Partial<Pick<EventTask, "status">>) =>
    api<EventTask>(`/tasks/${taskId}`, { method: "PATCH", body }),
  setDriveLink: (eventId: string, driveFolderUrl: string) =>
    api(`/events/${eventId}/drive`, { method: "PUT", body: { driveFolderUrl } }),
  addMedia: (eventId: string, body: { kind: string; url: string; title?: string }) =>
    api(`/events/${eventId}/media`, { method: "POST", body }),
  eventMedia: async (eventId: string) =>
    list<any>(await api(`/events/${eventId}/media`), "media")
      .map(normaliseMedia)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
  uploadPhoto: (eventId: string, file: LocalFile, caption?: string, onProgress?: (f: number) => void) =>
    uploadFile(file, { eventId, kind: "PHOTO", caption }, onProgress),

  // Notifications (IN_APP)
  notifications: async (unreadOnly = false) =>
    list<AppNotification>(await api(`/me/notifications${unreadOnly ? "?unread=1" : ""}`), "notifications"),
  markNotificationsRead: (ids?: string[]) =>
    api("/me/notifications/read", { method: "POST", body: ids ? { ids } : {} }),
};

export const STAFF_ROLES: Role[] = ["BRAND_ADMIN", "CAMPUS_ADMIN", "EVENT_MANAGER"];
export const CHECKIN_ROLES: Role[] = [...STAFF_ROLES, "VOLUNTEER"];

/** Pulls a ticket code out of a scanned QR value (raw code, URL path or ?code= param). */
export function extractTicketCode(raw: string): string {
  const value = raw.trim();
  try {
    const url = new URL(value);
    const fromParam = url.searchParams.get("code") ?? url.searchParams.get("ticket");
    if (fromParam) return fromParam;
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.replace(/\.png$/, "") === "qr" ? parts[parts.length - 2] ?? value : last;
  } catch {
    // not a URL
  }
  return value;
}
