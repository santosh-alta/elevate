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

export interface EventDetail extends EventSummary {
  sessions?: { id: string; title: string; speaker?: string | null; startsAt: string; endsAt: string; location?: string | null }[];
  guests?: { id: string; name: string; designation?: string | null; organization?: string | null; photoUrl?: string | null; role?: string }[];
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
  event: (idOrSlug: string) => api<EventDetail>(`/events/${encodeURIComponent(idOrSlug)}`),
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
