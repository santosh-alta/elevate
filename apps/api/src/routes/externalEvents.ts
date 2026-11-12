import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireBrandAdmin, requireStaff } from "../lib/permissions";
import { CATEGORY_SELECT } from "../lib/tags";
import { badRequest, notFound } from "../lib/errors";
import { readLinkPreview } from "../lib/linkPreview";
import { EXTERNAL_SOURCES, externalSettingsOf, labelFor, platformFor, syncExternalEvents } from "../lib/externalEvents";

const PUBLIC_EXTERNAL = {
  id: true, source: true, title: true, organizer: true, url: true, imageUrl: true, coverUrl: true, summary: true, teamSize: true, startsAt: true, endsAt: true,
  registrationEndsAt: true, mode: true, location: true, prize: true, participants: true, tags: true, major: true,
} as const;

/** "2026-12-01" from a date field means that day in India: starts at 00:00, deadlines and ends at 23:59. */
const day = (endOfDay: boolean) => z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${endOfDay ? "23:59:00" : "00:00:00"}+05:30`) : v),
  z.coerce.date(),
);
const optionalUrl = z.preprocess((v) => (v === "" ? null : v), z.string().url().max(1000).nullable().optional());
const MANUAL = z.object({
  title: z.string().trim().min(3).max(200), url: z.string().trim().url().max(1000),
  organizer: z.string().trim().max(120).nullish(), summary: z.string().trim().max(1500).nullish(),
  imageUrl: optionalUrl, coverUrl: optionalUrl,
  startsAt: day(false), endsAt: day(true), registrationEndsAt: day(true).nullish(),
  mode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).default("ONLINE"), location: z.string().trim().max(160).nullish(),
  prize: z.string().trim().max(80).nullish(), participants: z.coerce.number().int().min(0).max(10_000_000).nullish(),
  teamSize: z.string().trim().max(40).nullish(),
  tags: z.union([z.array(z.string()), z.string()]).transform((t) => (Array.isArray(t) ? t : t.split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 8)).default([]),
  major: z.coerce.boolean().default(false),
}).refine((x) => x.endsAt >= x.startsAt, { message: "End date must be on or after the start", path: ["endsAt"] });

const range = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((r) => r.to > r.from && r.to.getTime() - r.from.getTime() <= 400 * 86_400_000, "Range too long");

export function externalEventRoutes(app: FastifyInstance) {
  /** Public calendar: this brand's published events plus approved outside hackathons, between two dates. */
  app.get("/calendar", async (req) => {
    const tenant = requireTenant(req);
    const q = range.parse(req.query);
    const overlap = { startsAt: { lte: q.to }, endsAt: { gte: q.from } };
    const cfg = externalSettingsOf(tenant.settings);
    const [events, external] = await Promise.all([
      prisma.event.findMany({
        where: { tenantId: tenant.id, ...overlap, status: { notIn: ["DRAFT", "PLANNING", "CANCELLED"] }, approvalStatus: "APPROVED" },
        orderBy: { startsAt: "asc" },
        take: 500,
        select: {
          id: true, slug: true, title: true, type: true, startsAt: true, endsAt: true, mode: true, status: true, venue: true, coverImageUrl: true, scope: true,
          category: CATEGORY_SELECT, campuses: { select: { campus: { select: { id: true, name: true, code: true, city: true } } } },
        },
      }),
      cfg.enabled
        ? prisma.externalEvent.findMany({
            where: { tenantId: tenant.id, status: "APPROVED", OR: [overlap, { registrationEndsAt: { gte: q.from, lte: q.to } }] },
            orderBy: [{ major: "desc" }, { score: "desc" }],
            take: 300,
            select: PUBLIC_EXTERNAL,
          })
        : [],
    ]);
    return { events, external: external.map((e) => ({ ...e, sourceLabel: labelFor(e) })) };
  });

  /** Staff: everything pulled, newest first, with the settings. */
  app.get("/admin/external-events", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const q = z.object({ status: z.enum(["SUGGESTED", "APPROVED", "HIDDEN"]).optional(), source: z.string().max(20).optional() }).parse(req.query);
    const [items, counts, manualCount] = await Promise.all([
      prisma.externalEvent.findMany({
        where: { tenantId: tenant.id, endsAt: { gte: new Date() }, ...(q.status && { status: q.status }), ...(q.source && { source: q.source }) },
        orderBy: [{ major: "desc" }, { score: "desc" }],
        take: 400,
      }),
      prisma.externalEvent.groupBy({ by: ["status"], where: { tenantId: tenant.id, endsAt: { gte: new Date() } }, _count: true }),
      prisma.externalEvent.count({ where: { tenantId: tenant.id, source: "manual", endsAt: { gte: new Date() } } }),
    ]);
    return {
      items: items.map((e) => ({ ...e, sourceLabel: labelFor(e) })),
      counts: { ...Object.fromEntries(counts.map((c) => [c.status, c._count])), MANUAL: manualCount },
      settings: externalSettingsOf(tenant.settings),
      sources: EXTERNAL_SOURCES.map((s) => ({ key: s, label: labelFor({ source: s, url: "" }) })),
    };
  });

  /** Show or hide one listing. */
  app.patch<{ Params: { id: string } }>("/admin/external-events/:id", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const body = z.object({ status: z.enum(["SUGGESTED", "APPROVED", "HIDDEN"]) }).parse(req.body);
    const e = await prisma.externalEvent.findFirst({ where: { id: req.params.id, tenantId: tenant.id } });
    if (!e) throw notFound("Listing");
    return prisma.externalEvent.update({ where: { id: e.id }, data: { status: body.status, reviewedAt: new Date() } });
  });

  /** Fill from a link: reads the page's title, description, image and (when listed) dates. */
  app.post("/admin/external-events/lookup", async (req) => {
    requireStaff(req);
    const { url } = z.object({ url: z.string().trim().url() }).parse(req.body);
    try {
      const p = await readLinkPreview(url);
      const platform = platformFor(p.url) ?? p.siteName ?? null;
      const title = platform && p.title ? p.title.replace(new RegExp(`\\s+[|\\-–—:]\\s+${platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "") : p.title;
      return { ...p, title, platform };
    } catch (e) {
      throw badRequest(`Couldn't read that page (${(e as Error).message}). Fill the details in by hand.`);
    }
  });

  /** Add one by hand (e.g. Smart India Hackathon, a Google or Microsoft challenge, a HackerEarth contest). */
  app.post("/admin/external-events", async (req, reply) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const b = MANUAL.parse(req.body);
    const e = await prisma.externalEvent.create({
      data: { ...b, tenantId: tenant.id, source: "manual", sourceId: `manual-${Date.now()}`, status: "APPROVED", reviewedAt: new Date(), score: 10_000 },
    });
    return reply.status(201).send(e);
  });

  /** Edit one added by hand (pulled ones are refreshed daily, so they can only be shown or hidden). */
  app.put<{ Params: { id: string } }>("/admin/external-events/:id", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const e = await prisma.externalEvent.findFirst({ where: { id: req.params.id, tenantId: tenant.id } });
    if (!e) throw notFound("Listing");
    if (e.source !== "manual") throw badRequest("Listings pulled from other platforms update themselves; you can show or hide them.");
    const b = MANUAL.parse(req.body);
    return prisma.externalEvent.update({ where: { id: e.id }, data: { ...b, reviewedAt: new Date() } });
  });

  app.delete<{ Params: { id: string } }>("/admin/external-events/:id", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    await prisma.externalEvent.deleteMany({ where: { id: req.params.id, tenantId: tenant.id, source: "manual" } });
    return { ok: true };
  });

  /** Pull now instead of waiting for the daily run. */
  app.post("/admin/external-events/sync", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    return { result: await syncExternalEvents(tenant.id) };
  });

  app.patch("/admin/external-events-settings", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const b = z.object({
      enabled: z.boolean().optional(), autoApproveMajor: z.boolean().optional(),
      sources: z.array(z.enum(EXTERNAL_SOURCES)).optional(),
    }).parse(req.body);
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { settings: true } });
    const s = (t.settings ?? {}) as Record<string, unknown>;
    const next = { ...((s.externalEvents as object) ?? {}), ...b };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: { ...s, externalEvents: next } } });
    return externalSettingsOf({ externalEvents: next });
  });
}
