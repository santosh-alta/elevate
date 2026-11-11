import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { EVENT_TYPE_LABELS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { hasRole, requireEventCreator, requireEventManager } from "../lib/permissions";
import { HttpError, badRequest } from "../lib/errors";
import { aiEnabled, generate, stripFences } from "../lib/ai";
import { sanitizeHtml } from "../lib/html";

/**
 * AI writing help for event pages: write a description, rewrite text, suggest taglines, draft a page section or FAQs.
 * Who: anyone who can create events (staff and organizers). Limit: per person per day (India date);
 * brand admins get a bigger allowance. Failed calls don't count.
 */
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 5;
const ADMIN_DAILY_LIMIT = Number(process.env.AI_ADMIN_DAILY_LIMIT) || 30;

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TZ || "Asia/Kolkata" }).format(new Date());
}

function limitFor(req: FastifyRequest): number {
  return hasRole(req, ["BRAND_ADMIN"]) ? ADMIN_DAILY_LIMIT : DAILY_LIMIT;
}

async function usage(req: FastifyRequest) {
  const userId = req.auth!.user.id;
  const row = await prisma.aiUsage.findUnique({ where: { userId_day: { userId, day: today() } } });
  const limit = limitFor(req);
  const used = row?.count ?? 0;
  return { enabled: aiEnabled(), used, limit, remaining: Math.max(0, limit - used) };
}

/** Takes one use atomically (no race between two tabs). Returns false when today's allowance is used up. */
async function reserve(userId: string, tenantId: string, limit: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AiUsage" ("userId", "day", "tenantId", "count", "updatedAt")
    VALUES (${userId}, ${today()}, ${tenantId}, 1, now())
    ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "AiUsage"."count" + 1, "updatedAt" = now()
    WHERE "AiUsage"."count" < ${limit}
    RETURNING "count"`;
  return rows.length > 0;
}

const str = (max: number) => z.string().trim().max(max).optional();

const bodySchema = z.object({
  kind: z.enum(["description", "rewrite", "tagline", "section", "faqs"]),
  /** Saved event to read details from (optional for a new, unsaved event) */
  eventId: z.string().max(60).optional(),
  /** Unsaved values from the form; they win over the saved event */
  event: z
    .object({
      title: str(200), tagline: str(200), type: str(60), mode: str(20), venue: str(200),
      startsAt: str(40), endsAt: str(40), campuses: z.array(z.string().max(120)).max(20).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
    })
    .optional(),
  /** Extra notes from the organiser: speaker, topics, prizes… */
  notes: str(1500),
  /** rewrite: the text to rewrite (HTML or plain text) */
  text: z.string().max(12000).optional(),
  html: z.boolean().optional(),
  style: z.enum(["shorter", "longer", "engaging", "professional", "grammar", "simpler"]).optional(),
  /** section: its title, e.g. "Eligibility" */
  sectionTitle: str(120),
});
type Body = z.infer<typeof bodySchema>;

const STYLES: Record<NonNullable<Body["style"]>, string> = {
  shorter: "Make it about half as long. Keep every important fact.",
  longer: "Expand it a little with helpful detail, without inventing facts.",
  engaging: "Make it more engaging and exciting for college students, without hype or clichés.",
  professional: "Make it more polished and professional, suitable for faculty and industry guests.",
  grammar: "Only fix grammar, spelling and punctuation. Keep the wording and tone otherwise unchanged.",
  simpler: "Use simpler words and shorter sentences so a first-year student understands it easily.",
};

const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: process.env.DISPLAY_TZ || "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

const stripTags = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** The event facts the model may use, as short "Label: value" lines. Nothing about participants. */
async function eventFacts(req: FastifyRequest, body: Body): Promise<string> {
  const saved = body.eventId ? await requireEventManager(req, body.eventId) : null;
  const full = saved
    ? await prisma.event.findUnique({
        where: { id: saved.id },
        include: { category: { select: { name: true } }, campuses: { select: { campus: { select: { name: true } } } } },
      })
    : null;
  const e = body.event ?? {};
  const cfg = (full?.config ?? {}) as { minTeamSize?: number; maxTeamSize?: number; tracks?: { name: string; description?: string }[] };
  const facts: [string, string | undefined | null][] = [
    ["Title", e.title || full?.title],
    ["Tagline", e.tagline || full?.tagline],
    ["Type", e.type || full?.category?.name || (full ? EVENT_TYPE_LABELS[full.type] : undefined)],
    ["Mode", (e.mode || full?.mode)?.toLowerCase()],
    ["Venue", e.venue || full?.venue],
    ["Starts", e.startsAt ? fmtDate(e.startsAt) : full ? fmtDate(full.startsAt) : undefined],
    ["Ends", e.endsAt ? fmtDate(e.endsAt) : full ? fmtDate(full.endsAt) : undefined],
    ["Campuses", (e.campuses?.length ? e.campuses : full?.campuses.map((c) => c.campus.name))?.join(", ") || (full?.scope === "CENTRAL" ? "All campuses" : undefined)],
    ["Topics", (e.tags?.length ? e.tags : full?.tags)?.join(", ")],
    ["Fee", full ? (full.feeAmount ? `₹${full.feeAmount / 100}` : "Free") : undefined],
    ["Seats", full?.capacity ? String(full.capacity) : undefined],
    ["Team size", cfg.minTeamSize || cfg.maxTeamSize ? `${cfg.minTeamSize ?? 1}–${cfg.maxTeamSize ?? "?"} members` : undefined],
    ["Tracks", cfg.tracks?.length ? cfg.tracks.map((t) => t.name + (t.description ? ` (${t.description})` : "")).join("; ") : undefined],
    ["Current description", full?.description && body.kind !== "description" ? stripTags(full.description).slice(0, 1500) : undefined],
    ["Organiser notes", body.notes],
  ];
  const lines = facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (!lines.some((l) => l.startsWith("Title:"))) throw badRequest("Add the event title first");
  return lines.join("\n");
}

function system(brand: string) {
  return [
    `You write copy for event pages of ${brand}, an institute in India. Readers are college students.`,
    "Style: clear, warm and confident; short paragraphs; Indian English spelling; no emojis; no clichés like 'unlock', 'delve', 'game-changer' or 'in today's fast-paced world'.",
    "Never invent facts that weren't given (speaker names, prize amounts, fees, dates, companies, numbers).",
    "Where a specific fact is needed but missing, write a short placeholder in square brackets, e.g. [prize amount], for the organiser to fill in.",
    "Don't say or hint that the text was machine-written, and don't name any website or software platform (unless it is part of the event's topic). Output only what is asked, with no preamble.",
  ].join("\n");
}

const HTML_RULES = "Return HTML only, using just <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em> and <a>. No <html>, <body>, inline styles, markdown or code fences.";

export function aiRoutes(app: FastifyInstance) {
  app.get("/ai/usage", async (req) => {
    requireEventCreator(req);
    return usage(req);
  });

  app.post("/ai/write", async (req) => {
    const auth = requireEventCreator(req);
    const tenant = requireTenant(req);
    const body = bodySchema.parse(req.body);
    if (!aiEnabled()) throw new HttpError(503, "ai_disabled", "AI writing help isn't switched on yet");

    // Build the prompt first, so bad input doesn't use up an allowance.
    let prompt: string;
    let json = false;
    let maxTokens = 2048;
    if (body.kind === "rewrite") {
      const text = body.text?.trim();
      if (!text || stripTags(text).length < 3) throw badRequest("Write or select some text to rewrite");
      const style = STYLES[body.style ?? "engaging"];
      prompt = [
        `Rewrite the text below for an event page. ${style}`,
        body.html ? `Keep its structure (headings, lists, links). ${HTML_RULES}` : "Return plain text only, no HTML or markdown.",
        "", "Text:", text,
      ].join("\n");
      maxTokens = 4096;
    } else {
      const facts = await eventFacts(req, body);
      if (body.kind === "description") {
        prompt = [
          "Write the 'About this event' description for this event page, 150–250 words.",
          "Structure: an opening paragraph of 2–3 sentences on what it is and why it's worth attending; then an <h3> such as 'What you'll do' or 'What you'll learn' with 3–5 bullet points; then an <h3>Who should join</h3> with one short paragraph; end with a one-line call to register.",
          "Don't repeat the title as a heading, and leave out date, time, venue and fee (the page shows them separately).",
          HTML_RULES, "", "Event details:", facts,
        ].join("\n");
      } else if (body.kind === "section") {
        const title = body.sectionTitle?.trim();
        if (!title) throw badRequest("Give the section a title first");
        prompt = [
          `Write the '${title}' section of this event page, 40–160 words. Don't repeat '${title}' as a heading.`,
          "Prefer a short intro line plus a bullet list when it fits (eligibility, rules, prizes, schedule, timeline).",
          HTML_RULES, "", "Event details:", facts,
        ].join("\n");
      } else if (body.kind === "tagline") {
        json = true;
        prompt = [
          "Suggest 3 different taglines for this event: each one line, at most 70 characters, no quotes, no emojis, no trailing full stop.",
          'Return JSON: {"options": ["…", "…", "…"]}', "", "Event details:", facts,
        ].join("\n");
        maxTokens = 1024;
      } else {
        json = true;
        prompt = [
          "Write 6 frequently asked questions students would have about this event, with short, helpful answers (1–3 sentences).",
          "Cover who can join, cost, what to bring or prepare, certificates, and anything specific to this event. Use [placeholders] for facts you don't have.",
          'Return JSON: {"faqs": [{"q": "…", "a": "…"}]}', "", "Event details:", facts,
        ].join("\n");
      }
    }

    const limit = limitFor(req);
    if (!(await reserve(auth.user.id, tenant.id, limit))) {
      throw new HttpError(429, "ai_limit", `You've used all ${limit} AI uses for today. They reset at midnight.`);
    }

    let result;
    try {
      result = await generate({ system: system(tenant.name), prompt, json, maxTokens });
    } catch (e) {
      // Don't charge for failures.
      await prisma.aiUsage.update({ where: { userId_day: { userId: auth.user.id, day: today() } }, data: { count: { decrement: 1 } } }).catch(() => {});
      throw e;
    }
    await prisma.aiUsage.update({ where: { userId_day: { userId: auth.user.id, day: today() } }, data: { tokens: { increment: result.tokens } } }).catch(() => {});
    req.log.info({ kind: body.kind, model: result.model, tokens: result.tokens }, "ai write");

    const out = stripFences(result.text);
    const left = await usage(req);
    if (body.kind === "tagline") {
      const options = parseJson<{ options?: unknown[] }>(out)?.options?.map((o) => String(o).replace(/^["“]|["”.]$/g, "").trim().slice(0, 120)).filter(Boolean).slice(0, 3) ?? [];
      if (!options.length) throw new HttpError(502, "ai_bad_answer", "The AI's answer didn't make sense. Please try again.");
      return { options, usage: left };
    }
    if (body.kind === "faqs") {
      const faqs = (parseJson<{ faqs?: { q?: unknown; a?: unknown }[] }>(out)?.faqs ?? [])
        .map((f) => ({ q: String(f.q ?? "").trim().slice(0, 300), a: String(f.a ?? "").trim().slice(0, 1500) }))
        .filter((f) => f.q && f.a)
        .slice(0, 10);
      if (!faqs.length) throw new HttpError(502, "ai_bad_answer", "The AI's answer didn't make sense. Please try again.");
      return { faqs, usage: left };
    }
    if (body.kind === "rewrite" && !body.html) return { text: stripTags(out), usage: left };
    const html = sanitizeHtml(out);
    if (!stripTags(html)) throw new HttpError(502, "ai_bad_answer", "The AI's answer was empty. Please try again.");
    return { html, usage: left };
  });
}

function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    try { return m ? (JSON.parse(m[0]) as T) : null; } catch { return null; }
  }
}
