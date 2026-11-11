import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireBrandAdmin, requireStaff } from "../lib/permissions";
import { CATEGORY_SELECT } from "../lib/tags";
import { notFound } from "../lib/errors";
import { EXTERNAL_SOURCES, SOURCE_LABELS, externalSettingsOf, syncExternalEvents } from "../lib/externalEvents";

const PUBLIC_EXTERNAL = {
  id: true, source: true, title: true, organizer: true, url: true, imageUrl: true, coverUrl: true, summary: true, teamSize: true, startsAt: true, endsAt: true,
  registrationEndsAt: true, mode: true, location: true, prize: true, participants: true, tags: true, major: true,
} as const;

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
    return { events, external: external.map((e) => ({ ...e, sourceLabel: SOURCE_LABELS[e.source] ?? e.source })) };
  });

  /** Staff: everything pulled, newest first, with the settings. */
  app.get("/admin/external-events", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const q = z.object({ status: z.enum(["SUGGESTED", "APPROVED", "HIDDEN"]).optional() }).parse(req.query);
    const [items, counts] = await Promise.all([
      prisma.externalEvent.findMany({
        where: { tenantId: tenant.id, endsAt: { gte: new Date() }, ...(q.status && { status: q.status }) },
        orderBy: [{ major: "desc" }, { score: "desc" }],
        take: 400,
      }),
      prisma.externalEvent.groupBy({ by: ["status"], where: { tenantId: tenant.id, endsAt: { gte: new Date() } }, _count: true }),
    ]);
    return {
      items: items.map((e) => ({ ...e, sourceLabel: SOURCE_LABELS[e.source] ?? e.source })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      settings: externalSettingsOf(tenant.settings),
      sources: EXTERNAL_SOURCES.map((s) => ({ key: s, label: SOURCE_LABELS[s] })),
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

  /** Add one by hand (e.g. Smart India Hackathon, a Google or Microsoft challenge). */
  app.post("/admin/external-events", async (req, reply) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const b = z.object({
      title: z.string().trim().min(3).max(200), url: z.string().url(), organizer: z.string().trim().max(120).optional(),
      startsAt: z.coerce.date(), endsAt: z.coerce.date(), registrationEndsAt: z.coerce.date().optional(),
      mode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).default("ONLINE"), location: z.string().trim().max(160).optional(),
      prize: z.string().trim().max(80).optional(), major: z.coerce.boolean().default(true),
    }).refine((x) => x.endsAt >= x.startsAt, "End must be after start").parse(req.body);
    const e = await prisma.externalEvent.create({
      data: { ...b, tenantId: tenant.id, source: "manual", sourceId: `manual-${Date.now()}`, status: "APPROVED", reviewedAt: new Date(), score: 10_000 },
    });
    return reply.status(201).send(e);
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
