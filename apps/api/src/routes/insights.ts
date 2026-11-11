import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { EVENT_TYPE_LABELS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { isPlatformAdmin, requireStaff, roleOf } from "../lib/permissions";


/**
 * Insights: how events performed, compared across campuses, event types and time.
 * Counts only finished events (ended, not drafts or cancelled). Participants = registrations on the site, or the
 * turnout recorded for older events. "Reach" = share of a campus's current students who took part in at least one event.
 */
const ACTIVE = ["REGISTERED", "APPROVED", "CHECKED_IN", "NO_SHOW"] as const;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function insightRoutes(app: FastifyInstance) {
  app.get("/insights", async (req) => {
    const auth = requireStaff(req);
    const tenant = requireTenant(req);
    const q = z.object({ months: z.coerce.number().int().min(1).max(36).default(12), campusId: z.string().optional() }).parse(req.query);
    // Campus admins only see their campus (and central events).
    const campusId = roleOf(req) === "CAMPUS_ADMIN" && !isPlatformAdmin(req) ? auth.membership?.campusId ?? q.campusId : q.campusId;

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (q.months - 1), 1);
    const prevFrom = new Date(from.getFullYear(), from.getMonth() - q.months, 1);
    const base: Prisma.EventWhereInput = {
      tenantId: tenant.id, status: { notIn: ["DRAFT", "PLANNING", "CANCELLED"] }, approvalStatus: "APPROVED", endsAt: { lt: now },
      ...(campusId && { OR: [{ scope: "CENTRAL" }, { campuses: { some: { campusId } } }] }),
    };
    const [events, prevEvents, campuses] = await Promise.all([
      prisma.event.findMany({
        where: { ...base, startsAt: { gte: from } },
        select: {
          id: true, slug: true, title: true, type: true, scope: true, startsAt: true, config: true,
          category: { select: { name: true } }, campuses: { select: { campusId: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.event.findMany({ where: { ...base, startsAt: { gte: prevFrom, lt: from } }, select: { id: true, config: true } }),
      prisma.campus.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, code: true } }),
    ]);
    const ids = events.map((e) => e.id);
    const prevIds = prevEvents.map((e) => e.id);
    const [regs, prevRegs, attended, feedback, regUsers, students] = await Promise.all([
      prisma.registration.groupBy({ by: ["eventId"], where: { eventId: { in: ids }, status: { in: [...ACTIVE] } }, _count: true }),
      prisma.registration.groupBy({ by: ["eventId"], where: { eventId: { in: prevIds }, status: { in: [...ACTIVE] } }, _count: true }),
      prisma.registration.groupBy({ by: ["eventId"], where: { eventId: { in: ids }, status: "CHECKED_IN" }, _count: true }),
      prisma.feedback.findMany({ where: { eventId: { in: ids } }, select: { eventId: true, rating: true, nps: true, aspects: true } }),
      prisma.registration.findMany({ where: { eventId: { in: ids }, status: { in: [...ACTIVE] } }, select: { userId: true } }),
      prisma.student.groupBy({ by: ["campusId"], where: { tenantId: tenant.id, active: true, campusId: { not: null } }, _count: true }),
    ]);
    const regOf = new Map(regs.map((r) => [r.eventId, r._count]));
    const attOf = new Map(attended.map((r) => [r.eventId, r._count]));
    const recorded = (c: unknown) => {
      const x = (c ?? {}) as { participants?: number; registered?: number };
      return Number(x.participants) || Number(x.registered) || 0;
    };
    const participantsOf = (e: { id: string; config: unknown }, map = regOf) => map.get(e.id) || recorded(e.config);

    // Per event
    type Row = {
      id: string; slug: string; title: string; type: string; month: string; campusIds: string[];
      participants: number; registered: number; attended: number; responses: number; rating: number | null; nps: number | null;
      aspects: Record<string, number>;
    };
    const fbBy = new Map<string, typeof feedback>();
    for (const f of feedback) fbBy.set(f.eventId, [...(fbBy.get(f.eventId) ?? []), f]);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const rows: Row[] = events.map((e) => {
      const fb = fbBy.get(e.id) ?? [];
      const aspects: Record<string, number[]> = {};
      for (const f of fb) for (const [k, v] of Object.entries((f.aspects ?? {}) as Record<string, number>)) if (Number(v) >= 1) (aspects[k] ??= []).push(Number(v));
      return {
        id: e.id, slug: e.slug, title: e.title, type: e.category?.name ?? EVENT_TYPE_LABELS[e.type],
        month: `${e.startsAt.getFullYear()}-${String(e.startsAt.getMonth() + 1).padStart(2, "0")}`,
        campusIds: e.scope === "CENTRAL" ? [] : e.campuses.map((c) => c.campusId),
        participants: participantsOf(e), registered: regOf.get(e.id) ?? 0, attended: attOf.get(e.id) ?? 0,
        responses: fb.length, rating: avg(fb.map((f) => f.rating)), nps: avg(fb.filter((f) => f.nps != null).map((f) => f.nps!)),
        aspects: Object.fromEntries(Object.entries(aspects).map(([k, v]) => [k, round1(avg(v)!)])),
      };
    });

    // Totals and change vs the previous period of the same length
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const withCheckin = rows.filter((r) => r.attended > 0 && r.registered > 0);
    const allFb = feedback;
    const totals = {
      events: rows.length,
      participants: sum(rows.map((r) => r.participants)),
      attendanceRate: withCheckin.length ? round1((sum(withCheckin.map((r) => r.attended)) / sum(withCheckin.map((r) => r.registered))) * 100) : null,
      rating: allFb.length ? round1(avg(allFb.map((f) => f.rating))!) : null,
      responses: allFb.length,
      nps: allFb.some((f) => f.nps != null) ? round1(avg(allFb.filter((f) => f.nps != null).map((f) => f.nps!))!) : null,
      prevEvents: prevEvents.length,
      prevParticipants: sum(prevEvents.map((e) => participantsOf(e, new Map(prevRegs.map((r) => [r.eventId, r._count]))))),
    };

    // Month by month
    const months: string[] = [];
    for (let i = 0; i < q.months; i++) {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const trend = months.map((m) => {
      const rs = rows.filter((r) => r.month === m);
      const fb = rs.flatMap((r) => fbBy.get(r.id) ?? []);
      return { month: m, events: rs.length, participants: sum(rs.map((r) => r.participants)), rating: fb.length ? round1(avg(fb.map((f) => f.rating))!) : null };
    });

    // By campus (central events go to "All campuses (HQ)")
    const memberships = await prisma.membership.findMany({
      where: { tenantId: tenant.id, userId: { in: [...new Set(regUsers.map((r) => r.userId))] } }, select: { userId: true, campusId: true },
    });
    const campusOfUser = new Map(memberships.map((m) => [m.userId, m.campusId]));
    const reachedBy = new Map<string, Set<string>>();
    for (const r of regUsers) {
      const c = campusOfUser.get(r.userId);
      if (c) reachedBy.set(c, (reachedBy.get(c) ?? new Set()).add(r.userId));
    }
    const studentsBy = new Map(students.map((s) => [s.campusId!, s._count]));
    const groups = [{ id: "HQ", name: "All campuses (HQ)" }, ...campuses.map((c) => ({ id: c.id, name: c.name }))];
    const byCampus = groups.map((g) => {
      const rs = rows.filter((r) => (g.id === "HQ" ? !r.campusIds.length : r.campusIds.includes(g.id)));
      const fb = rs.flatMap((r) => fbBy.get(r.id) ?? []);
      const ck = rs.filter((r) => r.attended > 0 && r.registered > 0);
      const aspects: Record<string, number[]> = {};
      for (const f of fb) for (const [k, v] of Object.entries((f.aspects ?? {}) as Record<string, number>)) if (Number(v) >= 1) (aspects[k] ??= []).push(Number(v));
      const studentsHere = g.id === "HQ" ? 0 : studentsBy.get(g.id) ?? 0;
      const reached = g.id === "HQ" ? 0 : reachedBy.get(g.id)?.size ?? 0;
      return {
        id: g.id, name: g.name, events: rs.length, participants: sum(rs.map((r) => r.participants)),
        attendanceRate: ck.length ? round1((sum(ck.map((r) => r.attended)) / sum(ck.map((r) => r.registered))) * 100) : null,
        rating: fb.length ? round1(avg(fb.map((f) => f.rating))!) : null, responses: fb.length,
        students: studentsHere, reached, reach: studentsHere ? round1((reached / studentsHere) * 100) : null,
        aspects: Object.fromEntries(Object.entries(aspects).map(([k, v]) => [k, round1(avg(v)!)])),
      };
    }).filter((c) => c.events > 0 || c.students > 0);

    // By event type
    const types = [...new Set(rows.map((r) => r.type))];
    const byType = types.map((t) => {
      const rs = rows.filter((r) => r.type === t);
      const fb = rs.flatMap((r) => fbBy.get(r.id) ?? []);
      return { type: t, events: rs.length, participants: sum(rs.map((r) => r.participants)), avgParticipants: Math.round(sum(rs.map((r) => r.participants)) / rs.length), rating: fb.length ? round1(avg(fb.map((f) => f.rating))!) : null };
    }).sort((a, b) => b.participants - a.participants);

    const campusName = new Map(campuses.map((c) => [c.id, c.name]));
    const eventsOut = rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, type: r.type, month: r.month,
      campus: r.campusIds.length ? r.campusIds.map((c) => campusName.get(c) ?? "").join(", ") : "All campuses (HQ)",
      participants: r.participants, attendanceRate: r.registered && r.attended ? round1((r.attended / r.registered) * 100) : null,
      rating: r.rating != null ? round1(r.rating) : null, responses: r.responses, nps: r.nps != null ? round1(r.nps) : null,
    })).sort((a, b) => b.participants - a.participants);

    return { from, to: now, months: q.months, campusId: campusId ?? null, totals, trend, byCampus, byType, events: eventsOut, campuses: campuses.map((c) => ({ id: c.id, name: c.name })) };
  });
}
