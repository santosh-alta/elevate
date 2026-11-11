import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireBrandAdmin, requireEventCreator, requireStaff } from "../lib/permissions";
import { badRequest } from "../lib/errors";
import { studentSourceFor, syncStudents } from "../lib/studentSync";
import { audience } from "../lib/audience";
import { reminderHoursOf } from "../worker";

/** Student list (synced from the student database), event audiences and notification settings. */
export function studentRoutes(app: FastifyInstance) {
  /** Counts by campus, batch and program, plus sync status. Used by Settings and the event form. */
  app.get("/students/summary", async (req) => {
    requireEventCreator(req);
    const tenant = requireTenant(req);
    const where = { tenantId: tenant.id, active: true };
    const [total, byCampus, byBatch, byProgram, campuses] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.groupBy({ by: ["campusId", "campusCode", "campusName"], where, _count: true }),
      prisma.student.groupBy({ by: ["batch"], where, _count: true, orderBy: { batch: "desc" } }),
      prisma.student.groupBy({ by: ["program"], where, _count: true }),
      prisma.campus.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, code: true } }),
    ]);
    const name = new Map(campuses.map((c) => [c.id, c.name]));
    const campusRows = new Map<string, { campusId: string | null; name: string; codes: string[]; students: number }>();
    for (const r of byCampus) {
      const key = r.campusId ?? `x:${r.campusCode}`;
      const row = campusRows.get(key) ?? { campusId: r.campusId, name: r.campusId ? name.get(r.campusId) ?? "" : r.campusName ?? r.campusCode ?? "Unknown", codes: [], students: 0 };
      if (r.campusCode) row.codes.push(r.campusCode);
      row.students += r._count;
      campusRows.set(key, row);
    }
    const sync = ((tenant.settings ?? {}) as { studentSync?: { lastSyncAt?: string; total?: number } }).studentSync ?? null;
    return {
      connected: !!studentSourceFor(tenant.slug) && !!process.env.REDASH_URL && !!process.env.REDASH_KEY,
      lastSyncAt: sync?.lastSyncAt ?? null, total,
      campuses: [...campusRows.values()].sort((a, b) => b.students - a.students),
      batches: byBatch.filter((b) => b.batch).map((b) => ({ batch: b.batch!, students: b._count })),
      programs: byProgram.filter((p) => p.program).map((p) => ({ program: p.program!, students: p._count })).sort((a, b) => b.students - a.students),
    };
  });

  /** Pull the latest student list now. */
  app.post("/students/sync", async (req) => {
    requireBrandAdmin(req);
    return syncStudents(requireTenant(req).id);
  });

  /** How many people an audience reaches (for the event form). */
  app.get("/students/audience", async (req) => {
    requireEventCreator(req);
    const tenant = requireTenant(req);
    const q = z.object({ campusIds: z.string().optional(), batches: z.string().optional(), programs: z.string().optional() }).parse(req.query);
    const list = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
    const people = await audience({
      tenantId: tenant.id,
      campusIds: q.campusIds ? list(q.campusIds) : null,
      batches: list(q.batches).map(Number).filter(Number.isInteger),
      programs: list(q.programs),
    });
    return { count: people.length };
  });

  /** Browse the student list (staff). */
  app.get("/students", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const q = z.object({
      q: z.string().trim().max(80).optional(), campusId: z.string().optional(), batch: z.coerce.number().int().optional(),
      page: z.coerce.number().int().min(1).default(1),
    }).parse(req.query);
    const where: Prisma.StudentWhereInput = {
      tenantId: tenant.id, active: true,
      ...(q.campusId && { campusId: q.campusId === "none" ? null : q.campusId }),
      ...(q.batch && { batch: q.batch }),
      ...(q.q && { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] }),
    };
    const [items, total] = await Promise.all([
      prisma.student.findMany({ where, orderBy: [{ batch: "desc" }, { name: "asc" }], skip: (q.page - 1) * 50, take: 50, select: { id: true, name: true, email: true, campusName: true, campusId: true, program: true, batch: true, userId: true } }),
      prisma.student.count({ where }),
    ]);
    return { items, total, page: q.page, pages: Math.ceil(total / 50) };
  });

  /** Link a student-database campus code to one of our campuses (or unlink it). */
  app.put("/students/campus-map", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const { code, campusId } = z.object({ code: z.string().min(1).max(60), campusId: z.string().nullable() }).parse(req.body);
    const campuses = await prisma.campus.findMany({ where: { tenantId: tenant.id } });
    if (campusId && !campuses.some((c) => c.id === campusId)) throw badRequest("Unknown campus");
    for (const c of campuses) {
      const has = c.externalCodes.includes(code);
      if (c.id === campusId && !has) await prisma.campus.update({ where: { id: c.id }, data: { externalCodes: [...c.externalCodes, code] } });
      if (c.id !== campusId && has) await prisma.campus.update({ where: { id: c.id }, data: { externalCodes: c.externalCodes.filter((x) => x !== code) } });
    }
    const moved = await prisma.student.updateMany({ where: { tenantId: tenant.id, campusCode: code }, data: { campusId } });
    return { ok: true, students: moved.count };
  });

  /** Brand-wide notification settings: reminder times, and whether new events email students by default. */
  app.get("/notification-settings", async (req) => {
    requireStaff(req);
    const s = (requireTenant(req).settings ?? {}) as { notifications?: { announceByDefault?: boolean } };
    return { reminderHours: reminderHoursOf(s), announceByDefault: s.notifications?.announceByDefault === true };
  });

  app.put("/notification-settings", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const body = z.object({
      reminderHours: z.array(z.number().positive().max(24 * 14)).max(6),
      announceByDefault: z.boolean(),
    }).parse(req.body);
    const fresh = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { settings: true } });
    const settings = { ...((fresh.settings ?? {}) as Record<string, unknown>) };
    settings.notifications = { ...((settings.notifications ?? {}) as object), reminderHours: [...new Set(body.reminderHours)].sort((a, b) => b - a), announceByDefault: body.announceByDefault };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
    return { reminderHours: reminderHoursOf(settings), announceByDefault: body.announceByDefault };
  });
}
