import { prisma } from "../plugins/prisma";

/**
 * Outside hackathons and competitions students can join, pulled once a day from the public listings
 * of Unstop, Devfolio, MLH and Devpost. Only the basics are kept (title, dates, mode, place, prize, link),
 * and every item links back to the original page, where students register.
 *
 * Kept: open or upcoming, online or in India. Each gets a popularity score; "major" ones (lots of
 * registrations, big prizes, featured) can be shown automatically, the rest wait for an admin.
 * An admin's approve/hide is never undone by a later sync.
 */

export type ExternalSettings = { enabled: boolean; autoApproveMajor: boolean; sources: string[]; lastSyncAt?: string; lastResult?: Record<string, number | string> };
export const EXTERNAL_SOURCES = ["unstop", "devfolio", "mlh", "devpost", "leetcode", "codeforces", "codechef"] as const;
/** Timed coding contests: shown automatically (official platforms), as "Coding contests" on the calendar. */
export const CONTEST_SOURCES = ["leetcode", "codeforces", "codechef"];
export const SOURCE_LABELS: Record<string, string> = { unstop: "Unstop", devfolio: "Devfolio", mlh: "MLH", devpost: "Devpost", leetcode: "LeetCode", codeforces: "Codeforces", codechef: "CodeChef", manual: "Added by team" };

const PLATFORMS: [RegExp, string][] = [
  [/unstop\.com$/, "Unstop"], [/devfolio\.co$/, "Devfolio"], [/devpost\.com$/, "Devpost"], [/mlh\.(io|com)$/, "MLH"],
  [/hackerearth\.com$/, "HackerEarth"], [/hack2skill\.com$/, "Hack2skill"], [/kaggle\.com$/, "Kaggle"], [/codechef\.com$/, "CodeChef"],
  [/leetcode\.com$/, "LeetCode"], [/codeforces\.com$/, "Codeforces"], [/hackerrank\.com$/, "HackerRank"], [/geeksforgeeks\.org$/, "GeeksforGeeks"],
  [/sih\.gov\.in$/, "Smart India Hackathon"], [/google\.com$|withgoogle\.com$|g\.co$/, "Google"], [/microsoft\.com$/, "Microsoft"],
  [/aws\.amazon\.com$|amazon\.(in|com)$/, "Amazon"], [/lu\.ma$/, "Luma"], [/eventbrite\.(com|co\.in)$/, "Eventbrite"],
  [/townscript\.com$/, "Townscript"], [/konfhub\.com$/, "KonfHub"], [/commudle\.com$/, "Commudle"],
];

/** Known platform from a link (e.g. "HackerEarth"), or null. */
export function platformFor(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch { return null; }
}

/** What students see after "External ·": the source, or for team-added ones the platform of their link. */
export function labelFor(e: { source: string; url: string }): string {
  if (e.source !== "manual") return SOURCE_LABELS[e.source] ?? e.source;
  if (platformFor(e.url)) return platformFor(e.url)!;
  try { return new URL(e.url).hostname.replace(/^www\./, ""); } catch { return SOURCE_LABELS.manual; }
}

export function externalSettingsOf(settings: unknown): ExternalSettings {
  const s = ((settings ?? {}) as { externalEvents?: Partial<ExternalSettings> }).externalEvents ?? {};
  return {
    enabled: s.enabled ?? true,
    autoApproveMajor: s.autoApproveMajor ?? true,
    sources: (s.sources ?? [...EXTERNAL_SOURCES]).filter((x) => (EXTERNAL_SOURCES as readonly string[]).includes(x)),
    lastSyncAt: s.lastSyncAt,
    lastResult: s.lastResult,
  };
}

type Item = {
  source: string; sourceId: string; title: string; organizer?: string | null; url: string; imageUrl?: string | null;
  coverUrl?: string | null; summary?: string | null; teamSize?: string | null;
  startsAt: Date; endsAt: Date; registrationEndsAt?: Date | null; mode: "ONLINE" | "OFFLINE" | "HYBRID";
  location?: string | null; prize?: string | null; participants?: number | null; tags: string[]; score: number; major: boolean;
  kind?: "HACKATHON" | "CONTEST";
};

const UA = "Mozilla/5.0 (compatible; CampusEventsCalendar/1.0)";
const valid = (d: Date) => !Number.isNaN(d.getTime());
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

/** HTML or Markdown → a short plain-text summary (no links, no "join our WhatsApp" lines), cut at a sentence. */
export function toSummary(raw?: string | null, max = 420): string | null {
  if (!raw) return null;
  let t = raw
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m))
    .replace(/[*_#>`]+/g, " ");
  t = t.split("\n").map((l) => l.trim()).filter((l) => l && !/https?:\/\/|whatsapp|telegram|discord/i.test(l)).join(" ");
  t = t.replace(/\s+/g, " ").replace(/^(overview|about( the (hackathon|event|challenge|competition))?)\s*:?\s+/i, "").trim();
  if (t.length <= max) return t || null;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  const out = end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  return out.replace(/\s+\d+\.$/, "").replace(/[:,;]$/, ".");
}

const team = (min?: number | null, max?: number | null) => (!max ? null : max === 1 ? "Solo" : `${min && min > 1 ? min : 1}–${max} members`);

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

// ---------- Unstop ----------
type UnstopRow = {
  id: number; title: string; seo_url?: string; public_url?: string; logoUrl2?: string | null; region?: string;
  organisation?: { name?: string } | null; address_with_country_logo?: { city?: string; state?: string; country?: { name?: string } } | null;
  prizes?: { cash?: number | null; currencyCode?: string }[] | null; registerCount?: number; viewsCount?: number; end_date?: string;
  regnRequirements?: { start_regn_dt?: string; end_regn_dt?: string; min_team_size?: number; max_team_size?: number } | null;
  workfunction?: { name?: string }[] | null; isPaid?: boolean; details?: string | null;
};

async function fromUnstop(): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; page <= 4; page++) {
    const d = await getJson<{ data: { data: UnstopRow[]; last_page: number } }>(`https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=50&oppstatus=open&page=${page}`);
    for (const e of d.data.data) {
      const regEnd = e.regnRequirements?.end_regn_dt ? new Date(e.regnRequirements.end_regn_dt) : null;
      const end = e.end_date ? new Date(e.end_date) : regEnd;
      if (!end || !valid(end)) continue;
      const online = e.region === "online";
      const a = e.address_with_country_logo;
      if (!online && a?.country?.name && a.country.name !== "India") continue;
      const prizeSum = (e.prizes ?? []).reduce((s, p) => s + (p.currencyCode && p.currencyCode !== "INR" ? 0 : p.cash ?? 0), 0);
      const regs = e.registerCount ?? 0;
      const start = regEnd && valid(regEnd) && regEnd < end ? regEnd : end;
      out.push({
        source: "unstop", sourceId: String(e.id), title: e.title.trim(), organizer: e.organisation?.name ?? null,
        url: e.seo_url ?? `https://unstop.com/${e.public_url ?? ""}`, imageUrl: e.logoUrl2 ?? null,
        summary: toSummary(e.details), teamSize: team(e.regnRequirements?.min_team_size, e.regnRequirements?.max_team_size),
        startsAt: start, endsAt: end, registrationEndsAt: regEnd && valid(regEnd) ? regEnd : null,
        mode: online ? "ONLINE" : "OFFLINE", location: online ? null : [a?.city, a?.state].filter(Boolean).join(", ") || null,
        prize: prizeSum ? `${inr(prizeSum)} in prizes` : null, participants: regs || null,
        tags: (e.workfunction ?? []).map((w) => w.name ?? "").filter(Boolean).slice(0, 4),
        score: regs + prizeSum / 500 + (e.viewsCount ?? 0) / 200,
        major: !e.isPaid && (regs >= 400 || prizeSum >= 1_00_000),
      });
    }
    if (page >= d.data.last_page) break;
  }
  return out;
}

// ---------- Devfolio ----------
type DevfolioHit = { _source: {
  uuid: string; name: string; slug: string; tagline?: string | null; starts_at: string; ends_at: string; is_online?: boolean;
  city?: string | null; state?: string | null; country?: string | null; participants_count?: number | null; cover_img?: string | null;
  featured?: boolean | null; devfolio_official?: boolean | null; themes?: { name?: string }[] | null; private?: boolean;
  hackathon_setting?: { reg_ends_at?: string | null; logo?: string | null } | null; desc?: string | null; team_min?: number | null; team_size?: number | null;
} };

async function fromDevfolio(): Promise<Item[]> {
  const out: Item[] = [];
  for (const type of ["application_open", "upcoming"]) {
    const d = await getJson<{ hits: { hits: DevfolioHit[] } }>("https://api.devfolio.co/api/search/hackathons", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, from: 0, size: 60 }),
    });
    for (const { _source: h } of d.hits.hits) {
      if (h.private) continue;
      const start = new Date(h.starts_at), end = new Date(h.ends_at);
      if (!valid(start) || !valid(end)) continue;
      if (!h.is_online && h.country && h.country !== "India") continue;
      const regEnd = h.hackathon_setting?.reg_ends_at ? new Date(h.hackathon_setting.reg_ends_at) : null;
      const n = h.participants_count ?? 0;
      out.push({
        source: "devfolio", sourceId: h.uuid, title: h.name.trim(), organizer: null,
        url: `https://${h.slug}.devfolio.co/`, imageUrl: h.hackathon_setting?.logo ?? h.cover_img ?? null, coverUrl: h.cover_img ?? null,
        summary: toSummary([h.tagline, h.desc].filter(Boolean).join("\n")), teamSize: team(h.team_min, h.team_size),
        startsAt: start, endsAt: end, registrationEndsAt: regEnd && valid(regEnd) ? regEnd : null,
        mode: h.is_online ? "ONLINE" : "OFFLINE", location: h.is_online ? null : [h.city, h.state].filter(Boolean).join(", ") || null,
        prize: null, participants: n || null, tags: (h.themes ?? []).map((t) => t.name ?? "").filter(Boolean).slice(0, 4),
        score: n + (h.featured || h.devfolio_official ? 1000 : 0),
        major: n >= 500 || !!h.featured || !!h.devfolio_official,
      });
    }
  }
  return out;
}

// ---------- MLH (Major League Hacking): the season page embeds its event list as JSON ----------
type MlhEvent = {
  id: string; slug: string; name: string; startsAt: string; endsAt: string; websiteUrl?: string | null; url?: string;
  location?: string | null; formatType?: string; logoUrl?: string | null; backgroundUrl?: string | null; region?: string | null; venueAddress?: { country?: string | null } | null;
};

async function fromMlh(): Promise<Item[]> {
  const year = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear();
  const res = await fetch(`https://www.mlh.com/seasons/${year}/events`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} mlh`);
  const html = await res.text();
  const json = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error("mlh: page format changed");
  const events = (JSON.parse(json) as { props?: { upcomingEvents?: MlhEvent[] } }).props?.upcomingEvents ?? [];
  const out: Item[] = [];
  for (const e of events) {
    const online = e.formatType === "digital";
    const hybrid = e.formatType === "hybrid";
    const india = e.venueAddress?.country === "IN" || e.venueAddress?.country === "India";
    if (!online && !hybrid && !india) continue;
    const start = new Date(e.startsAt), end = new Date(e.endsAt);
    if (!valid(start) || !valid(end)) continue;
    out.push({
      source: "mlh", sourceId: e.id, title: e.name.trim(), organizer: "Major League Hacking",
      url: e.websiteUrl || `https://www.mlh.com${e.url ?? ""}`, imageUrl: e.logoUrl ?? null, coverUrl: e.backgroundUrl ?? null,
      summary: `A Major League Hacking member event${online ? ", held online" : ""}. MLH events are free for students and run by student organisers worldwide.`,
      startsAt: start, endsAt: end, registrationEndsAt: null,
      mode: online ? "ONLINE" : hybrid ? "HYBRID" : "OFFLINE", location: online ? null : e.location ?? null,
      prize: null, participants: null, tags: ["MLH"], score: 800, major: true,
    });
  }
  return out;
}

// ---------- Devpost ----------
type DevpostRow = {
  id: number; title: string; url: string; thumbnail_url?: string | null; organization_name?: string | null; open_state?: string;
  submission_period_dates?: string; prize_amount?: string; registrations_count?: number; displayed_location?: { location?: string } | null;
  themes?: { name?: string }[]; prizes_counts?: { cash?: number; other?: number } | null; invite_only?: boolean; featured?: boolean;
};

/** "Oct 15 - Dec 01, 2026" or "Nov 12 - 20, 2026" → [start, end]. */
function devpostDates(s?: string): [Date, Date] | null {
  const m = s?.match(/^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))? - (?:([A-Z][a-z]{2}) )?(\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const [, m1, d1, y1, m2, d2, y2] = m;
  const start = new Date(`${m1} ${d1}, ${y1 ?? y2} 00:00 UTC`);
  const end = new Date(`${m2 ?? m1} ${d2}, ${y2} 23:59 UTC`);
  return valid(start) && valid(end) ? [start, end] : null;
}

async function fromDevpost(): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; page <= 3; page++) {
    const d = await getJson<{ hackathons: DevpostRow[] }>(`https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=${page}`);
    if (!d.hackathons?.length) break;
    for (const h of d.hackathons) {
      if (h.invite_only) continue;
      const loc = h.displayed_location?.location ?? "";
      const online = /online/i.test(loc);
      if (!online && !/india/i.test(loc)) continue;
      const dates = devpostDates(h.submission_period_dates);
      if (!dates) continue;
      const usd = Number((h.prize_amount ?? "").replace(/<[^>]+>/g, "").replace(/[^\d.]/g, "")) || 0;
      const regs = h.registrations_count ?? 0;
      out.push({
        source: "devpost", sourceId: String(h.id), title: h.title.trim(), organizer: h.organization_name ?? null,
        url: h.url, imageUrl: h.thumbnail_url ? (h.thumbnail_url.startsWith("//") ? `https:${h.thumbnail_url}` : h.thumbnail_url) : null,
        summary: [h.organization_name ? `Hosted by ${h.organization_name} on Devpost.` : null,
          h.themes?.length ? `Themes: ${h.themes.map((t) => t.name).filter(Boolean).join(", ")}.` : null,
          h.prizes_counts?.cash ? `${h.prizes_counts.cash} cash prize${h.prizes_counts.cash === 1 ? "" : "s"}${h.prizes_counts.other ? ` and ${h.prizes_counts.other} other` : ""}.` : null,
          "Submit your project online before the deadline."].filter(Boolean).join(" "),
        startsAt: dates[0], endsAt: dates[1], registrationEndsAt: dates[1],
        mode: online ? "ONLINE" : "OFFLINE", location: online ? null : loc || null,
        prize: usd ? `$${usd.toLocaleString("en-US")} in prizes` : null, participants: regs || null,
        tags: (h.themes ?? []).map((t) => t.name ?? "").filter(Boolean).slice(0, 4),
        score: regs + usd / 10, major: usd >= 10_000 || regs >= 1000,
      });
    }
  }
  return out;
}

// ---------- Coding contests (next 30 days) ----------
const CONTEST_WINDOW = 30 * 86_400_000;
const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const CONTEST_ICONS: Record<string, string> = { leetcode: "https://assets.leetcode.com/static_assets/public/icons/favicon-192x192.png" };
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
function contest(source: string, id: string, title: string, url: string, start: Date, minutes: number, summary: string, tags: string[]): Item {
  return {
    source, sourceId: id, title, organizer: SOURCE_LABELS[source], url, imageUrl: CONTEST_ICONS[source] ?? favicon(new URL(url).hostname),
    startsAt: start, endsAt: new Date(start.getTime() + minutes * 60_000), registrationEndsAt: null, mode: "ONLINE",
    location: null, prize: null, participants: null, tags, score: 0, major: false, kind: "CONTEST",
    summary: `${summary} ${mins(minutes)}, online and free. Sign in on ${SOURCE_LABELS[source]} and register before it starts.`,
  };
}

async function fromLeetcode(): Promise<Item[]> {
  const d = await getJson<{ data?: { upcomingContests?: { title: string; titleSlug: string; startTime: number; duration: number }[] } }>("https://leetcode.com/graphql", {
    method: "POST", headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
    body: JSON.stringify({ query: "{ upcomingContests { title titleSlug startTime duration } }" }),
  });
  return (d.data?.upcomingContests ?? []).map((c) => contest(
    "leetcode", c.titleSlug, c.title, `https://leetcode.com/contest/${c.titleSlug}`, new Date(c.startTime * 1000), Math.round(c.duration / 60),
    /biweekly/i.test(c.title) ? "LeetCode Biweekly Contest: 4 problems." : "LeetCode Weekly Contest: 4 problems.", ["DSA", "Rated"],
  ));
}

async function fromCodeforces(): Promise<Item[]> {
  const d = await getJson<{ result: { id: number; name: string; phase: string; durationSeconds: number; startTimeSeconds?: number }[] }>("https://codeforces.com/api/contest.list?gym=false");
  const now = Date.now();
  return d.result
    .filter((c) => c.phase === "BEFORE" && c.startTimeSeconds && c.startTimeSeconds * 1000 - now < CONTEST_WINDOW && c.durationSeconds <= 12 * 3600 && !/practice/i.test(c.name))
    .map((c) => {
      const div = c.name.match(/Div\.\s*\d(?:\s*\+\s*\d)?/i)?.[0];
      return contest("codeforces", String(c.id), c.name, `https://codeforces.com/contests/${c.id}`, new Date(c.startTimeSeconds! * 1000), Math.round(c.durationSeconds / 60),
        div ? `Codeforces round, ${div.replace(/\s+/g, " ")}.` : "Codeforces round.", ["Competitive programming", ...(div ? [div.replace(/\s+/g, " ")] : [])]);
    });
}

async function fromCodechef(): Promise<Item[]> {
  const d = await getJson<{ future_contests?: { contest_code: string; contest_name: string; contest_start_date_iso: string; contest_duration: string }[] }>(
    "https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all",
  );
  const now = Date.now();
  return (d.future_contests ?? [])
    .map((c) => ({ c, start: new Date(c.contest_start_date_iso) }))
    .filter(({ start }) => valid(start) && start.getTime() - now < CONTEST_WINDOW)
    .map(({ c, start }) => contest("codechef", c.contest_code, c.contest_name, `https://www.codechef.com/${c.contest_code}`, start, Number(c.contest_duration) || 120,
      /starters/i.test(c.contest_name) ? "CodeChef Starters: rated weekly contest." : "CodeChef contest.", ["DSA", ...(/rated/i.test(c.contest_name) ? ["Rated"] : [])]));
}

export const FETCHERS: Record<string, () => Promise<Item[]>> = {
  unstop: fromUnstop, devfolio: fromDevfolio, mlh: fromMlh, devpost: fromDevpost,
  leetcode: fromLeetcode, codeforces: fromCodeforces, codechef: fromCodechef,
};

/** Pulls every enabled source for one brand and saves new or changed listings. */
export async function syncExternalEvents(tenantId: string): Promise<Record<string, number | string>> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const cfg = externalSettingsOf(tenant.settings);
  const result: Record<string, number | string> = {};
  const now = new Date();
  const near = await campusPlaces(tenantId);
  // In-person events only count as major (and show automatically) near one of our campuses.
  const isMajor = (i: Item) => i.major && (i.mode !== "OFFLINE" || (!!i.location && near.some((p) => i.location!.toLowerCase().includes(p))));
  for (const source of cfg.sources) {
    try {
      const items = (await FETCHERS[source]()).filter((i) => i.endsAt > now && i.endsAt.getTime() - i.startsAt.getTime() < 120 * 86_400_000);
      const seen = new Set<string>();
      for (const i of items) {
        if (seen.has(i.sourceId)) continue;
        seen.add(i.sourceId);
        const data = { ...i, major: isMajor(i), fetchedAt: now };
        const existing = await prisma.externalEvent.findUnique({ where: { tenantId_source_sourceId: { tenantId, source: i.source, sourceId: i.sourceId } }, select: { id: true, reviewedAt: true, status: true } });
        if (existing) {
          // Refresh the details; leave an admin's decision alone, and only auto-show if nobody reviewed it.
          const status = !existing.reviewedAt && (i.kind === "CONTEST" || (cfg.autoApproveMajor && isMajor(i))) && existing.status === "SUGGESTED" ? "APPROVED" : undefined;
          await prisma.externalEvent.update({ where: { id: existing.id }, data: { ...data, ...(status && { status }) } });
        } else {
          await prisma.externalEvent.create({ data: { ...data, tenantId, status: i.kind === "CONTEST" || (cfg.autoApproveMajor && data.major) ? "APPROVED" : "SUGGESTED" } });
        }
      }
      result[source] = seen.size;
    } catch (e) {
      result[source] = `failed: ${(e as Error).message.slice(0, 80)}`;
      console.warn(`[external] ${source} failed`, e);
    }
  }
  // Listings that are over are no longer needed.
  await prisma.externalEvent.deleteMany({ where: { tenantId, source: { not: "manual" }, endsAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } });
  const fresh = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const s = (fresh.settings ?? {}) as Record<string, unknown>;
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...s, externalEvents: { ...((s.externalEvents as object) ?? {}), lastSyncAt: now.toISOString(), lastResult: result } } } });
  return result;
}

const NCR = ["delhi", "gurugram", "gurgaon", "noida", "faridabad", "ghaziabad", "sonipat", "sonepat"];

/** Lower-case city / region names of the brand's campuses (Delhi NCR expands to its cities). */
async function campusPlaces(tenantId: string): Promise<string[]> {
  const cs = await prisma.campus.findMany({ where: { tenantId }, select: { city: true, details: true } });
  const out = new Set<string>();
  for (const c of cs) {
    const region = ((c.details ?? {}) as { region?: string }).region;
    for (const v of [c.city, region]) {
      if (!v) continue;
      const x = v.toLowerCase().replace(/\s*ncr$/, "").trim();
      if (x) out.add(x);
      if (/delhi|ncr|sonipat|gurugram|noida/i.test(v)) NCR.forEach((n) => out.add(n));
    }
  }
  return [...out];
}

const lastAttempt = new Map<string, number>();

/** Daily, for brands that have it on (worker). */
export async function syncExternalEventsIfDue(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, settings: true } });
  for (const t of tenants) {
    const cfg = externalSettingsOf(t.settings);
    if (!cfg.enabled || !cfg.sources.length) continue;
    if (cfg.lastSyncAt && Date.now() - new Date(cfg.lastSyncAt).getTime() < 24 * 3_600_000) continue;
    if (Date.now() - (lastAttempt.get(t.id) ?? 0) < 3_600_000) continue;
    lastAttempt.set(t.id, Date.now());
    try {
      const r = await syncExternalEvents(t.id);
      console.info(`[external] ${t.slug}`, r);
    } catch (e) {
      console.warn(`[external] ${t.slug} sync failed`, e);
    }
  }
}
