// Elevate API client — follows docs/API.md. All endpoint calls and response
// normalisation live here, so contract changes only touch this file.
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { BrandTheme } from "./theme";

export interface BrandConfig {
  slug: string;
  appName: string;
  bundleId: string;
  scheme: string;
  iconColor: string;
  apiUrl: string;
  webUrl?: string;
}

export const brand: BrandConfig = (Constants.expoConfig?.extra?.brand as BrandConfig) ?? {
  slug: "altaschool",
  appName: "Elevate",
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
  OTHER: "Other",
};

export function eventTypeLabel(type?: string | null): string {
  if (!type) return "";
  return EVENT_TYPE_LABELS[type] ?? type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ");
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

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  theme: Partial<BrandTheme>;
  settings: { hashtags?: string[]; linkedinOrgUrl?: string; [k: string]: unknown };
  campuses: Campus[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  isPlatformAdmin?: boolean;
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
}

export interface JudgingRound {
  id: string;
  name: string;
  isOpen?: boolean;
}

export interface JudgeEvent extends EventSummary {
  rounds?: JudgingRound[];
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
  members?: { user?: { name: string }; name?: string; isLeader?: boolean }[];
  myScores: MyScore[];
  status: JudgeTeamStatus;
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

function normaliseJudgeTeam(t: any): JudgeTeam {
  const myScores: MyScore[] = list<MyScore>(t.myScores ?? t.scores ?? []);
  let status: JudgeTeamStatus = t.status ?? t.myStatus;
  if (status !== "PENDING" && status !== "DRAFT" && status !== "SUBMITTED") {
    status = myScores.length === 0 ? "PENDING" : myScores.some((s) => s.submittedAt) ? "SUBMITTED" : "DRAFT";
  }
  return { ...t, myScores, status };
}

function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const root = brand.apiUrl.replace(/\/$/, "");
  if (url.startsWith("/v1/")) return `${root}${url}`;
  if (url.startsWith("/files/")) return `${API_BASE}${url}`;
  return url.startsWith("/") ? `${root}${url}` : url;
}

function normaliseMedia(m: any): MediaItem {
  return { ...m, url: absoluteUrl(String(m.url ?? "")) };
}

function normaliseEvent(e: any): EventDetail {
  const asArray = (v: any) => (Array.isArray(v) ? v : []);
  return {
    ...e,
    guests: asArray(e.guests).map((g: any) => ({ ...g, photoUrl: g.photoUrl ? absoluteUrl(g.photoUrl) : g.photoUrl })),
    sponsors: asArray(e.sponsors)
      .map((s: any) => ({ ...s, logoUrl: s.logoUrl ? absoluteUrl(s.logoUrl) : s.logoUrl }))
      .sort((a: Sponsor, b: Sponsor) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    faqs: asArray(e.faqs).filter((f: any) => f && f.q),
    gallery: asArray(e.gallery).map(normaliseMedia),
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

// ───────── Endpoints ─────────

export const Api = {
  tenant: () => api<Tenant>("/tenant", { auth: false }),

  requestOtp: (email: string, name?: string) =>
    api<{ ok: boolean; devCode?: string }>("/auth/otp/request", {
      method: "POST",
      body: { email, ...(name ? { name } : {}) },
      auth: false,
    }),
  verifyOtp: (email: string, code: string) =>
    api<{ token: string; user: User }>("/auth/otp/verify", { method: "POST", body: { email, code }, auth: false }),
  me: () => api<{ user: User; membership: Membership | null }>("/me"),

  // Events
  events: async (query = "upcoming=1") => list<EventSummary>(await api(`/events?${query}`), "events"),
  event: async (idOrSlug: string) => normaliseEvent(await api<any>(`/events/${encodeURIComponent(idOrSlug)}`)),
  calendarUrl: (idOrSlug: string) => `${API_BASE}/events/${encodeURIComponent(idOrSlug)}/calendar.ics`,
  /** Public event page on the brand's website, when the brand has one configured. */
  publicEventUrl: (slug: string) => (WEB_BASE ? `${WEB_BASE}/events/${encodeURIComponent(slug)}` : null),
  register: (eventId: string, answers: Record<string, unknown> = {}) =>
    api<Registration>(`/events/${eventId}/register`, { method: "POST", body: { answers } }),
  cancelRegistration: (eventId: string) => api(`/events/${eventId}/register`, { method: "DELETE" }),
  myRegistrations: async () => list<Registration>(await api("/me/registrations"), "registrations"),

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
  judgeTeams: async (eventId: string, roundId?: string) => {
    const data: any = await api(`/judge/events/${eventId}/teams${roundId ? `?roundId=${roundId}` : ""}`);
    const teams = list<any>(data, "teams").map(normaliseJudgeTeam);
    return {
      teams,
      round: (data && !Array.isArray(data) ? data.round : undefined) as JudgingRound | undefined,
      rounds: (data && !Array.isArray(data) ? data.rounds : undefined) as JudgingRound[] | undefined,
    };
  },
  saveScores: (body: {
    roundId: string;
    teamId: string;
    scores: { criterionId: string; value: number; comment?: string }[];
    submit: boolean;
  }) => api("/judge/scores", { method: "PUT", body }),

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
