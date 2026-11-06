import Anthropic from "@anthropic-ai/sdk";
import type { SocialPlatform } from "@prisma/client";
import { EVENT_TYPE_LABELS, type EventType } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { settingsOf } from "./brand";
import { eventLinks } from "./notify";
import { MODEL, anthropic } from "./linkedin";

/** Facts a caption may use. Nothing else is stated, so captions never invent numbers or names. */
export interface CaptionFacts {
  brand: string;
  title: string;
  type: string;
  date: string;
  status: string;
  venue?: string;
  campuses: string[];
  attended?: number;
  registered: number;
  guests: { name: string; designation?: string | null; organization?: string | null; role: string; talkTitle?: string | null }[];
  winners: { team: string; award: string; project?: string | null }[];
  sponsors: string[];
  hashtags: string[];
  url: string;
  photoAlbumUrl?: string | null;
}

const LIMITS: Record<SocialPlatform, number> = {
  LINKEDIN: 2800, INSTAGRAM: 2100, X: 280, FACEBOOK: 2000, YOUTUBE: 4500, WHATSAPP: 900,
};

const STYLE: Record<SocialPlatform, string> = {
  LINKEDIN: "Professional and warm, 90-160 words, short paragraphs, thank guests and sponsors by name, end with hashtags (5 max) and the event link.",
  INSTAGRAM: "Energetic, 50-90 words, 1-3 emojis, no links in the text (say 'link in bio'), end with up to 10 hashtags.",
  X: "One punchy post under 260 characters including the link and at most 2 hashtags.",
  FACEBOOK: "Friendly community tone, 60-120 words, include the event link.",
  YOUTUBE: "A video description: one-line summary, then 3-5 bullet highlights, then the event link and hashtags.",
  WHATSAPP: "A short broadcast message for student groups, 30-60 words, plain text, include the event link.",
};

export async function captionFacts(eventId: string): Promise<CaptionFacts> {
  const e = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      tenant: true,
      campuses: { include: { campus: true } },
      guests: { where: { status: { in: ["CONFIRMED", "ARRIVED", "THANKED"] }, isPublic: true }, orderBy: { sortOrder: "asc" } },
      sponsors: { orderBy: { sortOrder: "asc" } },
      teams: { where: { award: { not: null } }, orderBy: { rank: "asc" } },
    },
  });
  const [registered, attended] = await Promise.all([
    prisma.registration.count({ where: { eventId, status: { in: ["REGISTERED", "APPROVED", "CHECKED_IN"] } } }),
    prisma.registration.count({ where: { eventId, status: "CHECKED_IN" } }),
  ]);
  const links = await eventLinks(e);
  return {
    brand: e.tenant.name,
    title: e.title,
    type: EVENT_TYPE_LABELS[e.type as EventType] ?? e.type,
    date: e.startsAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
    status: e.status,
    venue: e.mode === "ONLINE" ? "online" : e.venue ?? undefined,
    campuses: e.campuses.map((c) => c.campus.name),
    attended: attended || undefined,
    registered,
    guests: e.guests.map((g) => ({ name: g.name, designation: g.designation, organization: g.organization, role: g.role, talkTitle: g.talkTitle })),
    winners: e.teams.map((t) => ({ team: t.name, award: t.award!, project: t.projectTitle })),
    sponsors: e.sponsors.map((s) => s.name),
    hashtags: (settingsOf(e.tenant).hashtags ?? []).map((h) => `#${h.replace(/^#/, "").replace(/\s+/g, "")}`),
    url: links.page,
    photoAlbumUrl: e.driveFolderUrl,
  };
}

function guestLine(f: CaptionFacts): string {
  return f.guests
    .slice(0, 4)
    .map((g) => [g.name, [g.designation, g.organization].filter(Boolean).join(", ")].filter(Boolean).join(" ("))
    .map((s) => (s.includes("(") ? `${s})` : s))
    .join(", ");
}

/** Deterministic caption used without an AI key (or if the AI call fails). */
export function templateCaption(platform: SocialPlatform, f: CaptionFacts): string {
  const done = ["LIVE", "JUDGING", "COMPLETED", "ARCHIVED"].includes(f.status);
  const tags = (n: number) => [...new Set([...f.hashtags, `#${f.type.replace(/\s+/g, "")}`])].slice(0, n).join(" ");
  const guests = guestLine(f);
  const head = done
    ? `What a ${f.type.toLowerCase()}! ${f.title} by ${f.brand}${f.attended ? ` brought together ${f.attended} participants` : ""}${f.campuses.length ? ` from ${f.campuses.join(", ")}` : ""}.`
    : `Coming up on ${f.date}: ${f.title} — a ${f.type.toLowerCase()} by ${f.brand}${f.venue ? `, ${f.venue}` : ""}.`;
  const lines: string[] = [head];
  if (guests) lines.push(done ? `Thank you ${guests} for sharing your experience with our students.` : `Featuring ${guests}.`);
  if (f.winners.length) lines.push(`Congratulations to ${f.winners.map((w) => `Team ${w.team}`).join(", ")} on their wins!`);
  if (f.sponsors.length) lines.push(`Supported by ${f.sponsors.join(", ")}.`);

  switch (platform) {
    case "X": {
      const short = done ? `${f.title} by ${f.brand}: thank you to everyone who came!` : `${f.title} by ${f.brand} on ${f.date}. Register now!`;
      return `${short} ${f.url} ${tags(2)}`.slice(0, LIMITS.X);
    }
    case "INSTAGRAM":
      return `${lines.join("\n\n")}\n\n${done ? "More photos coming soon." : "Registration link in bio."}\n\n${tags(10)}`;
    case "WHATSAPP":
      return `*${f.title}*\n${done ? "Thank you for joining us!" : `${f.date}${f.venue ? ` · ${f.venue}` : ""}`}\n${guests ? `With ${guests}\n` : ""}${f.url}`;
    case "YOUTUBE":
      return `${head}\n\n${[guests && `• Guests: ${guests}`, f.winners.length && `• Winners: ${f.winners.map((w) => w.team).join(", ")}`, f.sponsors.length && `• Partners: ${f.sponsors.join(", ")}`].filter(Boolean).join("\n")}\n\n${f.url}\n${tags(5)}`;
    default:
      return `${lines.join("\n\n")}\n\n${done ? "Event page and highlights" : "Register here"}: ${f.url}\n\n${tags(5)}`;
  }
}

export async function aiCaption(platform: SocialPlatform, f: CaptionFacts): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "You write social media captions for an education brand's events. Use ONLY the facts given; never invent numbers, quotes or names. " +
        "Write in the brand's voice (first person plural). Output only the caption text.",
      messages: [{ role: "user", content: `Platform: ${platform}\nStyle: ${STYLE[platform]}\nFacts: ${JSON.stringify(f)}` }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text ? text.slice(0, LIMITS[platform]) : null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn(`[social] API error ${err.status}; using template`);
    else console.warn("[social] AI caption failed; using template", err);
    return null;
  }
}
