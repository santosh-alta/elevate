import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import type { FastifyRequest } from "fastify";
import type { Event, EventTask } from "@prisma/client";
import { WORK_TEAMS } from "@elevate/shared";
import { assertManageable, canManageEvent, isStaff, requireEventManager, requireStaff } from "../lib/permissions";
import { requireTenant } from "../plugins/tenant";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { fanOutAnnouncement } from "../lib/notify";

const phase = z.enum(["PRE", "DURING", "POST"]);
const taskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"]);
const expenseSchema = z.object({
  category: z.enum(["VENUE", "FOOD", "TRAVEL", "PRIZES", "MARKETING", "MEMENTO", "OTHER"]),
  description: z.string().min(1),
  planned: z.number().nonnegative().default(0),
  actual: z.number().nonnegative().default(0),
  receiptUrl: z.string().url().optional(),
});

/** Event managers can do anything with a task; team members can work on tasks assigned to them or their team. */
async function taskAccess(req: FastifyRequest, task: EventTask & { event: Event }): Promise<"manage" | "work"> {
  if (!req.auth) throw forbidden();
  const tenant = requireTenant(req);
  if (task.event.tenantId !== tenant.id) throw notFound("Task");
  if (await canManageEvent(req, task.event)) return "manage";
  const teams = req.auth.membership?.teams ?? [];
  if (isStaff(req) || req.auth.membership?.role === "ORGANIZER") {
    if (task.assigneeId === req.auth.user.id || (task.team && teams.includes(task.team))) return "work";
  }
  throw forbidden("This task belongs to another team");
}

export function planningRoutes(app: FastifyInstance) {
  /** Open tasks for me: assigned to me or to one of my teams, across this brand's events. */
  app.get("/me/tasks", async (req) => {
    const auth = requireStaff(req);
    const tenant = requireTenant(req);
    const { scope } = z.object({ scope: z.enum(["open", "all"]).default("open") }).parse(req.query);
    const teams = auth.membership?.teams ?? [];
    return prisma.eventTask.findMany({
      where: {
        event: { tenantId: tenant.id, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
        OR: [{ assigneeId: auth.user.id }, ...(teams.length ? [{ team: { in: teams } }] : [])],
        ...(scope === "open" && { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } }),
      },
      orderBy: [{ dueAt: "asc" }, { sortOrder: "asc" }],
      take: 300,
      include: {
        assignee: { select: { id: true, name: true } },
        event: { select: { id: true, slug: true, title: true, startsAt: true, status: true } },
      },
    });
  });

  // ───────── Tasks ─────────
  app.get<{ Params: { id: string } }>("/events/:id/tasks", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.eventTask.findMany({
      where: { eventId: event.id },
      orderBy: [{ phase: "asc" }, { sortOrder: "asc" }],
      include: { assignee: { select: { id: true, name: true, avatarUrl: true } } },
    });
  });

  app.post<{ Params: { id: string } }>("/events/:id/tasks", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        phase,
        title: z.string().min(1),
        notes: z.string().optional(),
        dueAt: z.coerce.date().optional(),
        assigneeId: z.string().optional(),
        team: z.enum(WORK_TEAMS).optional(),
        proofRequired: z.boolean().optional(),
      })
      .parse(req.body);
    const last = await prisma.eventTask.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: "desc" } });
    const task = await prisma.eventTask.create({
      data: { ...body, eventId: event.id, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    await logActivity(event.id, req.auth!.user.id, "task.created", { taskId: task.id, title: task.title });
    return reply.status(201).send(task);
  });

  app.patch<{ Params: { taskId: string } }>("/tasks/:taskId", async (req) => {
    const task = await prisma.eventTask.findUnique({ where: { id: req.params.taskId }, include: { event: true } });
    if (!task) throw notFound("Task");
    const access = await taskAccess(req, task);
    const body = z
      .object({
        status: taskStatus.optional(),
        team: z.enum(WORK_TEAMS).nullable().optional(),
        proofRequired: z.boolean().optional(),
        title: z.string().min(1).optional(),
        notes: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
        evidenceUrl: z.string().url().nullable().optional(),
        dueAt: z.coerce.date().nullable().optional(),
        phase: phase.optional(),
      })
      .parse(req.body);
    if (access === "work") {
      // Team members update progress, proof and notes, and can take a task; the rest is for event managers.
      const allowed = ["status", "evidenceUrl", "notes", "assigneeId"];
      const extra = Object.keys(body).filter((k) => !allowed.includes(k));
      if (extra.length) throw forbidden("Only the event's managers can change that");
      if (body.assigneeId && body.assigneeId !== req.auth!.user.id) throw forbidden("You can assign tasks to yourself only");
    }
    const proofRequired = body.proofRequired ?? task.proofRequired;
    const evidence = body.evidenceUrl !== undefined ? body.evidenceUrl : task.evidenceUrl;
    if (proofRequired && !evidence && (body.status ?? task.status) === "DONE") {
      throw badRequest("Add the proof link (e.g. the Instagram or LinkedIn post) before marking this done");
    }
    const completing = body.status && body.status !== task.status;
    const updated = await prisma.eventTask.update({
      where: { id: task.id },
      data: {
        ...body,
        ...(completing && { completedAt: body.status === "DONE" ? new Date() : null }),
      },
    });
    if (completing) {
      await logActivity(task.eventId, req.auth!.user.id, body.status === "DONE" ? "task.done" : "task.status", {
        taskId: task.id,
        title: task.title,
        status: body.status,
      });
    }
    return updated;
  });

  app.delete<{ Params: { taskId: string } }>("/tasks/:taskId", async (req) => {
    const task = await prisma.eventTask.findUnique({ where: { id: req.params.taskId }, include: { event: true } });
    if (!task) throw notFound("Task");
    await assertManageable(req, task.event);
    await prisma.eventTask.delete({ where: { id: task.id } });
    return { ok: true };
  });

  // Guests / speakers live in routes/guests.ts.

  // ───────── Budget ─────────
  app.get<{ Params: { id: string } }>("/events/:id/expenses", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const [items, totals] = await Promise.all([
      prisma.expense.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } }),
      prisma.expense.aggregate({ where: { eventId: event.id }, _sum: { planned: true, actual: true } }),
    ]);
    return { items, planned: Number(totals._sum.planned ?? 0), actual: Number(totals._sum.actual ?? 0) };
  });

  app.post<{ Params: { id: string } }>("/events/:id/expenses", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = expenseSchema.parse(req.body);
    const expense = await prisma.expense.create({ data: { ...body, eventId: event.id } });
    return reply.status(201).send(expense);
  });

  app.patch<{ Params: { expenseId: string } }>("/expenses/:expenseId", async (req) => {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.expenseId }, include: { event: true } });
    if (!expense) throw notFound("Expense");
    await assertManageable(req, expense.event);
    const body = expenseSchema.partial().parse(req.body);
    return prisma.expense.update({ where: { id: expense.id }, data: body });
  });

  app.delete<{ Params: { expenseId: string } }>("/expenses/:expenseId", async (req) => {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.expenseId }, include: { event: true } });
    if (!expense) throw notFound("Expense");
    await assertManageable(req, expense.event);
    await prisma.expense.delete({ where: { id: expense.id } });
    return { ok: true };
  });

  // ───────── Announcements ─────────
  app.get<{ Params: { id: string } }>("/events/:id/announcements", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.announcement.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" } });
  });

  app.post<{ Params: { id: string } }>("/events/:id/announcements", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        title: z.string().min(1),
        body: z.string().min(1),
        channels: z.array(z.enum(["EMAIL", "PUSH", "WHATSAPP", "IN_APP"])).default(["IN_APP"]),
      })
      .parse(req.body);
    // EMAIL and IN_APP fan out to registrants now; PUSH/WHATSAPP are stored for later phases.
    const a = await prisma.announcement.create({ data: { ...body, eventId: event.id } });
    const recipients = await fanOutAnnouncement(a.id);
    await logActivity(event.id, req.auth!.user.id, "announcement.sent", { title: a.title, channels: a.channels, recipients });
    return reply.status(201).send({ ...a, sentAt: new Date(), recipients });
  });
}
