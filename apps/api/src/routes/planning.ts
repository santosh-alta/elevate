import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { assertManageable, requireEventManager } from "../lib/permissions";
import { notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";

const phase = z.enum(["PRE", "DURING", "POST"]);
const taskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "SKIPPED"]);
const guestStatus = z.enum(["PROPOSED", "INVITED", "CONFIRMED", "DECLINED", "ARRIVED", "THANKED"]);

const guestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  organization: z.string().optional(),
  bio: z.string().optional(),
  photoUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  role: z.enum(["SPEAKER", "CHIEF_GUEST", "PANELIST", "JUDGE"]).default("SPEAKER"),
  status: guestStatus.default("PROPOSED"),
  travelNotes: z.string().optional(),
  honorarium: z.number().nonnegative().optional(),
  mementoGiven: z.boolean().optional(),
});

const expenseSchema = z.object({
  category: z.enum(["VENUE", "FOOD", "TRAVEL", "PRIZES", "MARKETING", "MEMENTO", "OTHER"]),
  description: z.string().min(1),
  planned: z.number().nonnegative().default(0),
  actual: z.number().nonnegative().default(0),
  receiptUrl: z.string().url().optional(),
});

export function planningRoutes(app: FastifyInstance) {
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
    await assertManageable(req, task.event);
    const body = z
      .object({
        status: taskStatus.optional(),
        title: z.string().min(1).optional(),
        notes: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
        evidenceUrl: z.string().url().nullable().optional(),
        dueAt: z.coerce.date().nullable().optional(),
        phase: phase.optional(),
      })
      .parse(req.body);
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

  // ───────── Guests / speakers ─────────
  app.get<{ Params: { id: string } }>("/events/:id/guests", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.eventGuest.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
  });

  app.post<{ Params: { id: string } }>("/events/:id/guests", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = guestSchema.parse(req.body);
    const guest = await prisma.eventGuest.create({
      data: { ...body, email: body.email?.toLowerCase(), eventId: event.id },
    });
    await logActivity(event.id, req.auth!.user.id, "guest.added", { guestId: guest.id, name: guest.name });
    return reply.status(201).send(guest);
  });

  app.patch<{ Params: { guestId: string } }>("/guests/:guestId", async (req) => {
    const guest = await prisma.eventGuest.findUnique({ where: { id: req.params.guestId }, include: { event: true } });
    if (!guest) throw notFound("Guest");
    await assertManageable(req, guest.event);
    const body = guestSchema.partial().extend({ thankYouSent: z.boolean().optional() }).parse(req.body);
    const { thankYouSent, ...fields } = body;
    const updated = await prisma.eventGuest.update({
      where: { id: guest.id },
      data: {
        ...fields,
        email: fields.email?.toLowerCase(),
        ...(thankYouSent !== undefined && { thankYouSentAt: thankYouSent ? new Date() : null }),
        ...(thankYouSent && { status: "THANKED" }),
      },
    });
    if (body.status && body.status !== guest.status) {
      await logActivity(guest.eventId, req.auth!.user.id, "guest.status", { guestId: guest.id, name: guest.name, status: updated.status });
    }
    return updated;
  });

  app.delete<{ Params: { guestId: string } }>("/guests/:guestId", async (req) => {
    const guest = await prisma.eventGuest.findUnique({ where: { id: req.params.guestId }, include: { event: true } });
    if (!guest) throw notFound("Guest");
    await assertManageable(req, guest.event);
    await prisma.eventGuest.delete({ where: { id: guest.id } });
    return { ok: true };
  });

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
    // Delivery to email/push/WhatsApp is a Phase 2 integration; IN_APP is shown immediately.
    const a = await prisma.announcement.create({ data: { ...body, eventId: event.id, sentAt: new Date() } });
    await logActivity(event.id, req.auth!.user.id, "announcement.sent", { title: a.title, channels: a.channels });
    return reply.status(201).send(a);
  });
}
