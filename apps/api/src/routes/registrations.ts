import type { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, canCheckIn, canManageEvent, findEvent, requireEventManager, requireUser } from "../lib/permissions";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";

interface FormField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registrationRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/events/:id/register", async (req, reply) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const event = await findEvent(req, req.params.id);
    const { answers } = z.object({ answers: z.record(z.unknown()).default({}) }).parse(req.body ?? {});

    if (event.status !== "REGISTRATION_OPEN") throw badRequest("Registrations are not open for this event");
    const now = new Date();
    if (event.registrationOpensAt && now < event.registrationOpensAt) throw badRequest("Registrations haven't opened yet");
    if (event.registrationClosesAt && now > event.registrationClosesAt) throw badRequest("Registrations have closed");

    const form = (event.registrationForm ?? []) as unknown as FormField[];
    const missing = form.filter((f) => f.required && (answers[f.id] === undefined || answers[f.id] === ""));
    if (missing.length) throw badRequest(`Please answer: ${missing.map((f) => f.label).join(", ")}`);

    // Make sure the person is a member of this brand.
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: "STUDENT" },
      update: {},
    });

    const existing = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } });
    if (existing && existing.status !== "CANCELLED") return existing;

    let status: "REGISTERED" | "APPROVED" | "WAITLISTED" = event.requiresApproval ? "REGISTERED" : "APPROVED";
    if (event.capacity) {
      const taken = await prisma.registration.count({
        where: { eventId: event.id, status: { in: ["REGISTERED", "APPROVED", "CHECKED_IN"] } },
      });
      if (taken >= event.capacity) status = "WAITLISTED";
    }

    const registration = existing
      ? await prisma.registration.update({ where: { id: existing.id }, data: { status, answers: answers as object } })
      : await prisma.registration.create({ data: { eventId: event.id, userId: user.id, status, answers: answers as object } });
    await logActivity(event.id, user.id, "registration.created", { status });
    return reply.status(201).send(registration);
  });

  app.delete<{ Params: { id: string } }>("/events/:id/register", async (req) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const reg = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } });
    if (!reg) throw notFound("Registration");
    if (reg.status === "CHECKED_IN") throw badRequest("You've already checked in to this event");
    const updated = await prisma.registration.update({ where: { id: reg.id }, data: { status: "CANCELLED" } });
    // Promote the oldest waitlisted person when a seat frees up.
    if (event.capacity && reg.status !== "WAITLISTED") {
      const next = await prisma.registration.findFirst({ where: { eventId: event.id, status: "WAITLISTED" }, orderBy: { createdAt: "asc" } });
      if (next) await prisma.registration.update({ where: { id: next.id }, data: { status: event.requiresApproval ? "REGISTERED" : "APPROVED" } });
    }
    await logActivity(event.id, user.id, "registration.cancelled", {});
    return updated;
  });

  app.get("/me/registrations", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    return prisma.registration.findMany({
      where: { userId: user.id, event: { tenantId: tenant.id } },
      orderBy: { event: { startsAt: "desc" } },
      include: {
        event: {
          select: {
            id: true, slug: true, title: true, type: true, mode: true, status: true, startsAt: true, endsAt: true,
            venue: true, meetingUrl: true, coverImageUrl: true,
          },
        },
      },
    });
  });

  app.get<{ Params: { ticketCode: string } }>("/registrations/:ticketCode/qr.png", async (req, reply) => {
    const auth = requireUser(req);
    const reg = await prisma.registration.findUnique({ where: { ticketCode: req.params.ticketCode }, include: { event: true } });
    if (!reg || reg.event.tenantId !== requireTenant(req).id) throw notFound("Ticket");
    if (reg.userId !== auth.user.id && !(await canCheckIn(req, reg.event))) throw forbidden();
    const png = await QRCode.toBuffer(reg.ticketCode, { width: 512, margin: 2 });
    return reply.type("image/png").header("Cache-Control", "private, max-age=86400").send(png);
  });

  app.get<{ Params: { id: string } }>("/events/:id/registrations", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const { format, status } = z
      .object({ format: z.enum(["json", "csv"]).default("json"), status: z.string().optional() })
      .parse(req.query);
    const regs = await prisma.registration.findMany({
      where: { eventId: event.id, ...(status && { status: status as never }) },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true, phone: true, linkedinUrl: true } } },
    });
    const memberships = await prisma.membership.findMany({
      where: { tenantId: event.tenantId, userId: { in: regs.map((r) => r.userId) } },
      include: { campus: { select: { name: true } } },
    });
    const byUser = new Map(memberships.map((m) => [m.userId, m]));
    const rows = regs.map((r) => {
      const m = byUser.get(r.userId);
      return { ...r, campus: m?.campus?.name ?? null, batch: m?.batch ?? null, rollNo: m?.rollNo ?? null };
    });

    if (format === "csv") {
      const form = (event.registrationForm ?? []) as unknown as FormField[];
      const header = ["Name", "Email", "Phone", "Campus", "Batch", "Roll no", "Status", "Registered at", "Checked in at", ...form.map((f) => f.label)];
      const lines = rows.map((r) => {
        const answers = (r.answers ?? {}) as Record<string, unknown>;
        return [
          r.user.name, r.user.email, r.user.phone, r.campus, r.batch, r.rollNo, r.status, r.createdAt, r.checkedInAt,
          ...form.map((f) => answers[f.id]),
        ].map(csvCell).join(",");
      });
      return reply
        .type("text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${event.slug}-registrations.csv"`)
        .send([header.map(csvCell).join(","), ...lines].join("\n"));
    }
    return rows;
  });

  app.patch<{ Params: { regId: string } }>("/registrations/:regId", async (req) => {
    const reg = await prisma.registration.findUnique({ where: { id: req.params.regId }, include: { event: true } });
    if (!reg) throw notFound("Registration");
    await assertManageable(req, reg.event);
    const { status } = z
      .object({ status: z.enum(["REGISTERED", "APPROVED", "WAITLISTED", "REJECTED", "CANCELLED", "CHECKED_IN", "NO_SHOW"]) })
      .parse(req.body);
    const updated = await prisma.registration.update({
      where: { id: reg.id },
      data: {
        status,
        ...(status === "CHECKED_IN" && !reg.checkedInAt && { checkedInAt: new Date(), checkedInById: req.auth!.user.id }),
      },
    });
    await logActivity(reg.eventId, req.auth!.user.id, "registration.status", { registrationId: reg.id, from: reg.status, to: status });
    return updated;
  });

  /** QR check-in from the volunteer app. Body: { ticketCode, eventId? } */
  app.post("/checkin", async (req) => {
    const auth = requireUser(req);
    const tenant = requireTenant(req);
    const { ticketCode, eventId } = z.object({ ticketCode: z.string().min(4), eventId: z.string().optional() }).parse(req.body);
    const reg = await prisma.registration.findUnique({
      where: { ticketCode: ticketCode.trim() },
      include: { event: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    if (!reg || reg.event.tenantId !== tenant.id) throw notFound("Ticket");
    if (eventId && reg.eventId !== eventId && reg.event.slug !== eventId) throw badRequest(`This ticket is for "${reg.event.title}"`);
    if (!(await canCheckIn(req, reg.event))) throw forbidden("You're not a volunteer or manager for this event");
    if (reg.status === "CANCELLED" || reg.status === "REJECTED") throw badRequest(`Registration is ${reg.status.toLowerCase()}`);

    const eventRef = { id: reg.event.id, title: reg.event.title };
    if (reg.status === "CHECKED_IN") {
      const { event: _e, user: _u, ...rest } = reg;
      return { registration: { ...rest, event: eventRef }, user: reg.user, alreadyCheckedIn: true };
    }
    const warning =
      reg.status === "WAITLISTED" ? "This person was on the waitlist" : reg.status === "REGISTERED" && reg.event.requiresApproval ? "Registration was not approved yet" : undefined;
    const updated = await prisma.registration.update({
      where: { id: reg.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: auth.user.id },
    });
    await logActivity(reg.eventId, auth.user.id, "checkin", { userId: reg.userId, name: reg.user.name });
    const checkedIn = await prisma.registration.count({ where: { eventId: reg.eventId, status: "CHECKED_IN" } });
    return { registration: { ...updated, event: eventRef }, user: reg.user, alreadyCheckedIn: false, warning, checkedInCount: checkedIn };
  });

  /** Lightweight check-in stats for the volunteer screen. */
  app.get<{ Params: { id: string } }>("/events/:id/checkin/stats", async (req) => {
    requireUser(req);
    const event = await findEvent(req, req.params.id);
    if (!(await canCheckIn(req, event)) && !(await canManageEvent(req, event))) throw forbidden();
    const groups = await prisma.registration.groupBy({ by: ["status"], where: { eventId: event.id }, _count: true });
    const get = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
    return {
      checkedIn: get("CHECKED_IN"),
      expected: get("APPROVED") + get("REGISTERED") + get("CHECKED_IN"),
      waitlisted: get("WAITLISTED"),
    };
  });
}
