import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { findEvent, isPlatformAdmin, requireEventManager, requireStaff, requireUser, roleOf } from "../lib/permissions";
import { badRequest, conflict } from "../lib/errors";
import { buildOutcome } from "../lib/outcome";
import { summariseOutcome } from "../lib/outcomeSummary";
import { renderEventReportPdf } from "../lib/eventReport";
import { withAllowance, writeLimitFor } from "../lib/aiUsage";
import { EVENT_FAMILIES, familyOf, type EventType } from "@elevate/shared";
import { CATEGORY_SELECT, eventMeta } from "../lib/tags";

export function reportRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/events/:id/feedback", async (req, reply) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        nps: z.number().int().min(0).max(10).optional(),
        comment: z.string().max(2000).optional(),
      })
      .parse(req.body);
    if (!["LIVE", "JUDGING", "COMPLETED"].includes(event.status)) throw badRequest("Feedback opens once the event has started");
    const reg = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } });
    if (!reg) throw badRequest("Only participants can leave feedback");
    const existing = await prisma.feedback.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } });
    if (existing) throw conflict("You've already shared feedback for this event");
    const fb = await prisma.feedback.create({ data: { ...body, eventId: event.id, userId: user.id } });
    return reply.status(201).send(fb);
  });

  app.get<{ Params: { id: string } }>("/events/:id/feedback", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.feedback.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" } });
  });

  /** Outcome report. ?cached=1 returns the last generated report without recomputing. */
  app.get<{ Params: { id: string } }>("/events/:id/outcome", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { cached } = z.object({ cached: z.coerce.boolean().optional() }).parse(req.query);
    if (cached && event.outcome) return event.outcome;
    return buildOutcome(event.id);
  });

  /** One-click event report as a branded PDF (numbers, results, feedback, photos, money, who did what). */
  app.get<{ Params: { id: string } }>("/events/:id/report.pdf", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const { pdf, filename } = await renderEventReportPdf(event.id);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Cache-Control", "no-store")
      .send(Buffer.from(pdf));
  });

  /** AI leadership summary of the outcome (why, how, what next). Counts as one AI use. */
  app.post<{ Params: { id: string } }>("/events/:id/outcome/summary", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const tenant = requireTenant(req);
    const limit = writeLimitFor(req);
    const { summary } = await withAllowance(
      { id: req.auth!.user.id, tenantId: tenant.id }, "write", limit,
      () => summariseOutcome(event.id),
      `You've used all ${limit} AI uses for today. They reset at midnight.`,
    );
    return summary;
  });

  /** Brand-level dashboard. Campus admins see their campus's events plus central events. */
  app.get("/dashboard", async (req) => {
    const auth = requireStaff(req);
    const tenant = requireTenant(req);
    const q = z
      .object({
        campusId: z.string().optional(),
        type: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(req.query);

    const campusId = roleOf(req) === "CAMPUS_ADMIN" && !isPlatformAdmin(req) ? auth.membership?.campusId ?? q.campusId : q.campusId;
    const where: Prisma.EventWhereInput = {
      tenantId: tenant.id,
      ...(campusId && { OR: [{ scope: "CENTRAL" }, { campuses: { some: { campusId } } }] }),
      ...(q.type && { type: q.type as never }),
      ...((q.from || q.to) && { startsAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }),
    };
    const eventRows = await prisma.event.findMany({ where, select: { id: true, type: true, tags: true } });
    const eventIds = eventRows.map((e) => e.id);
    const inEvents = { eventId: { in: eventIds } };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [regsByEvent, attendedByEvent, byStatus, byType, regTotal, regMonth, checkedIn, certs, liPosted, liTotal, upcoming, live, recentCompleted, overdue, socialPending] =
      await Promise.all([
        prisma.registration.groupBy({ by: ["eventId"], where: { ...inEvents, status: { notIn: ["CANCELLED", "REJECTED"] } }, _count: true }),
        prisma.registration.groupBy({ by: ["eventId"], where: { ...inEvents, status: "CHECKED_IN" }, _count: true }),
        prisma.event.groupBy({ by: ["status"], where, _count: true }),
        prisma.event.groupBy({ by: ["type"], where, _count: true }),
        prisma.registration.count({ where: { ...inEvents, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
        prisma.registration.count({ where: { ...inEvents, createdAt: { gte: monthStart }, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
        prisma.registration.count({ where: { ...inEvents, status: "CHECKED_IN" } }),
        prisma.certificate.count({ where: { ...inEvents, revokedAt: null } }),
        prisma.linkedInPost.count({ where: { ...inEvents, status: "POSTED" } }),
        prisma.linkedInPost.count({ where: inEvents }),
        prisma.event.findMany({
          where: { ...where, startsAt: { gte: now }, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
          orderBy: { startsAt: "asc" },
          take: 10,
          include: {
            _count: { select: { registrations: true } },
            campuses: { include: { campus: { select: { name: true } } } },
            category: CATEGORY_SELECT,
          },
        }),
        prisma.event.findMany({
          where: { ...where, status: { in: ["LIVE", "JUDGING"] } },
          include: { _count: { select: { registrations: true } }, category: CATEGORY_SELECT },
        }),
        prisma.event.findMany({
          where: { ...where, status: "COMPLETED" },
          orderBy: { endsAt: "desc" },
          take: 10,
          include: { _count: { select: { registrations: true, certificates: true, linkedinPosts: true } }, category: CATEGORY_SELECT },
        }),
        prisma.event.findMany({
          where: { ...where, status: { notIn: ["CANCELLED", "ARCHIVED", "DRAFT"] }, tasks: { some: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { lt: now } } } },
          select: {
            id: true, slug: true, title: true, status: true, startsAt: true,
            _count: { select: { tasks: { where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { lt: now } } } } },
          },
          orderBy: { startsAt: "asc" },
          take: 10,
        }),
        prisma.event.count({
          where: { ...where, status: "COMPLETED", OR: [{ socialPosts: { none: {} } }, { socialPosts: { some: { status: { not: "POSTED" } } } }] },
        }),
      ]);

    // Attendance rate across completed events.
    const completedIds = (await prisma.event.findMany({ where: { ...where, status: { in: ["COMPLETED", "ARCHIVED"] } }, select: { id: true } })).map((e) => e.id);
    const [compRegs, compAttended] = await Promise.all([
      prisma.registration.count({ where: { eventId: { in: completedIds }, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
      prisma.registration.count({ where: { eventId: { in: completedIds }, status: "CHECKED_IN" } }),
    ]);

    // Per family and per tag, for the selected period.
    const regsOf = new Map(regsByEvent.map((r) => [r.eventId, r._count]));
    const attendedOf = new Map(attendedByEvent.map((r) => [r.eventId, r._count]));
    const byFamily = EVENT_FAMILIES.map((f) => {
      const rows = eventRows.filter((e) => familyOf(e.type as EventType) === f.key);
      return {
        family: f.key,
        label: f.label,
        events: rows.length,
        registrations: rows.reduce((s, e) => s + (regsOf.get(e.id) ?? 0), 0),
        attended: rows.reduce((s, e) => s + (attendedOf.get(e.id) ?? 0), 0),
      };
    });
    // Tags are grouped case-insensitively and shown in their most used spelling.
    const tagStats = new Map<string, { spellings: Map<string, number>; events: number; registrations: number }>();
    for (const e of eventRows) {
      for (const tag of new Set(e.tags)) {
        const key = tag.toLowerCase();
        const row = tagStats.get(key) ?? { spellings: new Map<string, number>(), events: 0, registrations: 0 };
        row.spellings.set(tag, (row.spellings.get(tag) ?? 0) + 1);
        row.events += 1;
        row.registrations += regsOf.get(e.id) ?? 0;
        tagStats.set(key, row);
      }
    }
    const byTag = [...tagStats.values()]
      .map(({ spellings, events, registrations }) => ({
        tag: [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
        events,
        registrations,
      }))
      .sort((a, b) => b.events - a.events || b.registrations - a.registrations || a.tag.localeCompare(b.tag)).slice(0, 15);

    return {
      kpis: {
        events: eventIds.length,
        registrations: regTotal,
        registrationsThisMonth: regMonth,
        checkedIn,
        attendanceRate: compRegs ? Math.round((compAttended / compRegs) * 1000) / 10 : null,
        certificatesIssued: certs,
        linkedinPosted: liPosted,
        linkedinDrafts: liTotal,
        eventsAwaitingSocial: socialPending,
      },
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
      byFamily,
      byTag,
      upcoming: upcoming.map(({ campuses, ...e }) => ({ ...e, ...eventMeta(e), outcome: undefined, campuses: campuses.map((c) => c.campus.name) })),
      live: live.map((e) => ({ ...e, ...eventMeta(e), outcome: undefined })),
      recentCompleted: recentCompleted.map((e) => ({ ...e, ...eventMeta(e), outcome: undefined })),
      overdue: overdue.map((e) => ({ ...e, overdueTasks: e._count.tasks })),
    };
  });
}
