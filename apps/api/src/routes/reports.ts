import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { findEvent, isPlatformAdmin, requireEventManager, requireStaff, requireUser, roleOf } from "../lib/permissions";
import { badRequest, conflict } from "../lib/errors";
import { buildOutcome } from "../lib/outcome";

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
    const eventIds = (await prisma.event.findMany({ where, select: { id: true } })).map((e) => e.id);
    const inEvents = { eventId: { in: eventIds } };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [byStatus, byType, regTotal, regMonth, checkedIn, certs, liPosted, liTotal, upcoming, live, recentCompleted, overdue, socialPending] =
      await Promise.all([
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
          include: { _count: { select: { registrations: true } }, campuses: { include: { campus: { select: { name: true } } } } },
        }),
        prisma.event.findMany({ where: { ...where, status: { in: ["LIVE", "JUDGING"] } }, include: { _count: { select: { registrations: true } } } }),
        prisma.event.findMany({
          where: { ...where, status: "COMPLETED" },
          orderBy: { endsAt: "desc" },
          take: 10,
          include: { _count: { select: { registrations: true, certificates: true, linkedinPosts: true } } },
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
      upcoming: upcoming.map(({ campuses, ...e }) => ({ ...e, outcome: undefined, campuses: campuses.map((c) => c.campus.name) })),
      live: live.map((e) => ({ ...e, outcome: undefined })),
      recentCompleted: recentCompleted.map((e) => ({ ...e, outcome: undefined })),
      overdue: overdue.map((e) => ({ ...e, overdueTasks: e._count.tasks })),
    };
  });
}
