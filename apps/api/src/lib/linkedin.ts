import Anthropic from "@anthropic-ai/sdk";
import type { CertificateType, Event, Tenant } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { brandBaseUrl, settingsOf, verifyUrl } from "./brand";
import { notifyLinkedInReady, safely } from "./notify";

export interface DraftContext {
  name: string;
  role: "PARTICIPANT" | "WINNER" | "RUNNER_UP" | "SPECIAL_MENTION" | "FINALIST" | "JUDGE" | "SPEAKER" | "VOLUNTEER" | "MENTOR";
  teamName?: string;
  projectTitle?: string;
  awardLabel?: string;
  eventTitle: string;
  eventType: string;
  eventDate: Date;
  brandName: string;
  hashtags: string[];
  certificateUrl?: string;
}

export const TYPE_WORD: Record<string, string> = {
  HACKATHON: "hackathon", SEMINAR: "seminar", WORKSHOP: "workshop", GUEST_LECTURE: "guest lecture",
  COMPETITION: "competition", BOOTCAMP: "bootcamp", WEBINAR: "webinar", CULTURAL: "event", OTHER: "event",
  ENTREPRENEURSHIP: "entrepreneurship event", STARTUP_PITCH: "startup pitch", CONFERENCE: "conference",
  PANEL_DISCUSSION: "panel discussion", MEETUP: "meetup", CAREER_FAIR: "career fair", INDUSTRY_VISIT: "industry visit",
  ORIENTATION: "orientation", ALUMNI_MEET: "alumni meet", SPORTS: "sports event",
};

function tags(ctx: DraftContext): string {
  const base = [...ctx.hashtags, TYPE_WORD[ctx.eventType] ?? "event", "learning"];
  return [...new Set(base.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")))].map((h) => `#${h}`).join(" ");
}

/** Deterministic, personalised template used when no AI key is configured (or the AI call fails). */
export function templateDraft(ctx: DraftContext): string {
  const kind = TYPE_WORD[ctx.eventType] ?? "event";
  const at = `${ctx.eventTitle} by ${ctx.brandName}`;
  const lines: string[] = [];
  switch (ctx.role) {
    case "WINNER":
    case "RUNNER_UP":
    case "SPECIAL_MENTION":
      lines.push(`🏆 Thrilled to share that our team${ctx.teamName ? ` "${ctx.teamName}"` : ""} won ${ctx.awardLabel ?? "an award"} at ${at}!`);
      if (ctx.projectTitle) lines.push(`We built "${ctx.projectTitle}" — and learned a lot about building fast under pressure, working as a team, and pitching an idea clearly.`);
      else lines.push("It was an intense experience of building fast, working as a team, and pitching our idea clearly.");
      lines.push("Huge thanks to the judges, mentors and organisers for a great experience.");
      break;
    case "FINALIST":
      lines.push(`Proud to share that our team${ctx.teamName ? ` "${ctx.teamName}"` : ""} made it to the finals of ${at}!`);
      if (ctx.projectTitle) lines.push(`We built "${ctx.projectTitle}" and got to pitch it to the jury — a great learning experience.`);
      lines.push("Thank you to the judges, mentors and organisers.");
      break;
    case "JUDGE":
      lines.push(`It was a privilege to serve as a judge at ${at}.`);
      lines.push("The energy, creativity and quality of the ideas the teams brought in were genuinely impressive. Congratulations to every team that took part!");
      break;
    case "SPEAKER":
      lines.push(`I had a great time speaking at ${at}.`);
      lines.push("Thank you to the students for the thoughtful questions and to the team for organising it so well.");
      break;
    case "VOLUNTEER":
    case "MENTOR":
      lines.push(`Proud to have been part of the team behind ${at} as a ${ctx.role === "MENTOR" ? "mentor" : "volunteer"}.`);
      lines.push("Seeing everything come together on the day made all the planning worth it.");
      break;
    default:
      if (ctx.teamName) {
        lines.push(`Had an amazing time taking part in ${at} with my team "${ctx.teamName}"!`);
        if (ctx.projectTitle) lines.push(`We worked on "${ctx.projectTitle}" and learned a lot along the way.`);
      } else {
        lines.push(`I attended the ${kind} "${ctx.eventTitle}" organised by ${ctx.brandName}, and it was a great learning experience.`);
        lines.push("My key takeaways: [add 2–3 things you learned].");
      }
      lines.push(`Thank you ${ctx.brandName} for organising it!`);
  }
  if (ctx.certificateUrl) lines.push(`\nCertificate: ${ctx.certificateUrl}`);
  lines.push(`\n${tags(ctx)}`);
  return lines.join("\n");
}

export const MODEL = "claude-opus-5-5";
let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** AI-written draft via Claude; returns null on any failure so callers fall back to the template. */
export async function aiDraft(ctx: DraftContext): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "You write short, authentic LinkedIn posts for students and professionals about events they took part in. " +
        "Write in first person, warm and specific, 80–150 words, no more than 2 emojis, and no claims beyond the facts given. " +
        "If something they learned isn't known, leave a short bracketed placeholder for them to fill in. " +
        "Put the certificate link (if given) on its own line, then end with the hashtags given. Output only the post text.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            name: ctx.name,
            role: ctx.role,
            team: ctx.teamName,
            project: ctx.projectTitle,
            award: ctx.awardLabel,
            event: ctx.eventTitle,
            eventType: TYPE_WORD[ctx.eventType] ?? "event",
            date: ctx.eventDate.toDateString(),
            organiser: ctx.brandName,
            certificateLink: ctx.certificateUrl,
            hashtags: tags(ctx),
          }),
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[linkedin] rate limited; using template");
    else if (err instanceof Anthropic.APIError) console.warn(`[linkedin] API error ${err.status}; using template`);
    else console.warn("[linkedin] AI draft failed; using template", err);
    return null;
  }
}

export function shareUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

const ROLE_PRIORITY: CertificateType[] = ["WINNER", "RUNNER_UP", "SPECIAL_MENTION", "FINALIST", "SPEAKER", "JUDGE", "MENTOR", "VOLUNTEER", "PARTICIPATION"];
const AWARD_LABEL: Record<string, string> = {
  WINNER: "first place", RUNNER_UP: "1st runner-up", SECOND_RUNNER_UP: "2nd runner-up", SPECIAL_MENTION: "a special mention",
};

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

/**
 * Creates a LinkedIn draft for every participant (certificate holders, else checked-in / registered users).
 * Existing drafts that the user already edited or posted are left alone.
 */
export async function generateLinkedInDrafts(eventId: string): Promise<{ created: number; total: number; generatedBy: string }> {
  const event = (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { tenant: true } })) as Event & { tenant: Tenant };
  const settings = settingsOf(event.tenant);
  const base = await brandBaseUrl(event.tenantId);

  const certs = await prisma.certificate.findMany({ where: { eventId, revokedAt: null }, include: { user: true } });
  const best = new Map<string, { name: string; type: CertificateType | "PARTICIPATION"; serial?: string }>();
  for (const c of certs) {
    if (!c.userId || !c.user) continue; // guests without an account don't get drafts
    const prev = best.get(c.userId);
    if (!prev || ROLE_PRIORITY.indexOf(c.type) < ROLE_PRIORITY.indexOf(prev.type as CertificateType)) {
      best.set(c.userId, { name: c.user.name, type: c.type, serial: c.serial });
    }
  }
  if (!best.size) {
    const regs = await prisma.registration.findMany({
      where: { eventId, status: { in: ["CHECKED_IN", "APPROVED", "REGISTERED"] } },
      include: { user: true },
    });
    for (const r of regs) best.set(r.userId, { name: r.user.name, type: "PARTICIPATION" });
  }

  const memberships = await prisma.teamMember.findMany({ where: { team: { eventId } }, include: { team: true } });
  const teamOf = new Map(memberships.map((m) => [m.userId, m.team]));

  const existing = await prisma.linkedInPost.findMany({ where: { eventId } });
  const locked = new Set(existing.filter((p) => p.status !== "SUGGESTED").map((p) => p.userId));
  const useAi = !!process.env.ANTHROPIC_API_KEY;
  let created = 0;

  await mapLimit([...best.entries()].filter(([userId]) => !locked.has(userId)), useAi ? 4 : 20, async ([userId, info]) => {
    const team = teamOf.get(userId);
    const role: DraftContext["role"] = info.type === "PARTICIPATION" ? "PARTICIPANT" : info.type;
    const ctx: DraftContext = {
      name: info.name,
      role,
      teamName: team?.name,
      projectTitle: team?.projectTitle ?? undefined,
      awardLabel: team?.award ? AWARD_LABEL[team.award] : undefined,
      eventTitle: event.title,
      eventType: event.type,
      eventDate: event.startsAt,
      brandName: event.tenant.name,
      hashtags: settings.hashtags ?? [],
      certificateUrl: info.serial ? verifyUrl(base, info.serial) : undefined,
    };
    const ai = await aiDraft(ctx);
    const draft = ai ?? templateDraft(ctx);
    const generatedBy = ai ? "ai" : "template";
    const had = existing.some((p) => p.userId === userId);
    await prisma.linkedInPost.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, draft, generatedBy },
      update: { draft, generatedBy },
    });
    if (!had) {
      created++;
      safely("linkedin.ready", () => notifyLinkedInReady(eventId, userId));
    }
  });

  const total = await prisma.linkedInPost.count({ where: { eventId } });
  return { created, total, generatedBy: useAi ? "ai" : "template" };
}
