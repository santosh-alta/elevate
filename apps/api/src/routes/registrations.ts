import type { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, canCheckIn, canManageEvent, findEvent, requireEventManager, requireUser } from "../lib/permissions";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { notifyRegistration, notifyTeamAdded, safely } from "../lib/notify";
import { registerInputSchema } from "@elevate/shared";
import type { Payment, RegistrationStatus } from "@prisma/client";
import { conflict } from "../lib/errors";
import { brandCode, teamInviteCode } from "../lib/codes";
import { CATEGORY_SELECT, eventMeta } from "../lib/tags";
import { findOrCreateMember, promoteWaitlist, seatsLeft } from "../lib/seats";
import {
  PAYMENT_TTL_MS, attachOrder, evaluateCoupon, getPaymentConfig, isPaidEvent, markPaymentPaid, newReceiptNo, paymentResponse,
  priceFor, releasePayment,
} from "../lib/payments";

interface FormField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface TeamConfig {
  minTeamSize?: number;
  maxTeamSize?: number;
  tracks?: { id: string; name: string }[];
  teamRegistration?: "WITH_TEAM" | "JOIN_LATER";
}

const memberInclude = {
  members: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" as const },
  },
};

async function activeRegistration(eventId: string, userId: string) {
  return prisma.registration.findFirst({ where: { eventId, userId, status: { notIn: ["CANCELLED", "REJECTED"] } } });
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registrationRoutes(app: FastifyInstance) {
  /**
   * Register for an event, alone or with a team (the caller is the leader), free or paid.
   * Body: registerInputSchema `{ answers, team?: { name, trackId?, problemStatementId?, members[] }, couponCode? }`.
   * Response keeps the registration's fields at the top level (older clients) and adds `{ registration, team, payment }`.
   */
  app.post<{ Params: { id: string } }>("/events/:id/register", async (req, reply) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const event = await findEvent(req, req.params.id);
    const input = registerInputSchema.parse(req.body ?? {});
    const answers = input.answers as Record<string, unknown>;

    if (event.status !== "REGISTRATION_OPEN") throw badRequest("Registrations are not open for this event");
    const now = new Date();
    if (event.registrationOpensAt && now < event.registrationOpensAt) throw badRequest("Registrations haven't opened yet");
    if (event.registrationClosesAt && now > event.registrationClosesAt) throw badRequest("Registrations have closed");

    const form = (event.registrationForm ?? []) as unknown as FormField[];
    const missing = form.filter((f) => f.required && (answers[f.id] === undefined || answers[f.id] === ""));
    if (missing.length) throw badRequest(`Please answer: ${missing.map((f) => f.label).join(", ")}`);

    const modules = (event.modules ?? {}) as Record<string, boolean>;
    const config = (event.config ?? {}) as TeamConfig;
    const teamsOn = !!modules.teams;
    if (input.team && !teamsOn) throw badRequest("This event doesn't use teams — register on your own");
    if (teamsOn && config.teamRegistration !== "JOIN_LATER" && !input.team) {
      throw badRequest("This event takes team registrations: add your team name and members");
    }

    // Make sure the person is a member of this brand.
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: "STUDENT" },
      update: {},
    });

    let existing = await prisma.registration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      include: { payment: true },
    });
    // Pending payment: hand back the same order while it's valid; release it once it has expired or failed.
    if (existing?.status === "PENDING_PAYMENT" && existing.payment) {
      const p = existing.payment;
      if (p.status === "CREATED" && (!p.expiresAt || p.expiresAt > now)) {
        const team = p.teamId ? await prisma.team.findUnique({ where: { id: p.teamId }, include: memberInclude }) : null;
        const { payment: _p, ...registration } = existing;
        return reply.status(200).send({ ...registration, registration, team, payment: await paymentResponse(p) });
      }
      if (p.status === "CREATED" || p.status === "FAILED") await releasePayment(p.id, "EXPIRED");
      existing = await prisma.registration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        include: { payment: true },
      });
    }
    if (existing && existing.status !== "CANCELLED") {
      if (input.team) throw conflict("You're already registered for this event");
      const { payment: _p, ...registration } = existing;
      return { ...registration, registration, team: null, payment: null };
    }

    // ───── Team checks ─────
    const members = input.team?.members ?? [];
    const size = 1 + members.length;
    const memberUsers = members.length
      ? await prisma.user.findMany({ where: { email: { in: members.map((m) => m.email.toLowerCase()) } } })
      : [];
    if (input.team) {
      const min = config.minTeamSize ?? 1;
      const max = config.maxTeamSize ?? 4;
      if (size < min || size > max) {
        throw badRequest(`Teams need ${min === max ? min : `${min}–${max}`} people including you (you added ${size})`);
      }
      const seen = new Set<string>();
      for (const m of members) {
        const email = m.email.toLowerCase();
        if (email === user.email.toLowerCase()) throw badRequest(`${email} is your own email — add only your teammates`);
        if (seen.has(email)) throw badRequest(`${email} is listed twice`);
        seen.add(email);
      }
      if (memberUsers.length) {
        const regs = await prisma.registration.findMany({
          where: { eventId: event.id, userId: { in: memberUsers.map((u) => u.id) }, status: { notIn: ["CANCELLED", "REJECTED"] } },
          include: { user: true },
        });
        if (regs.length) throw badRequest(`${regs[0].user.email} is already registered for this event`);
        const inTeam = await prisma.teamMember.findFirst({
          where: { userId: { in: memberUsers.map((u) => u.id) }, team: { eventId: event.id } },
          include: { user: true, team: true },
        });
        // Stale memberships from a cancelled registration are cleaned up below; a live one is a conflict.
        if (inTeam && (await activeRegistration(event.id, inTeam.userId))) throw badRequest(`${inTeam.user.email} is already in another team`);
      }
      if (input.team.trackId && config.tracks?.length && !config.tracks.some((t) => t.id === input.team!.trackId)) throw badRequest("Unknown track");
      if (input.team.problemStatementId) {
        const ps = await prisma.problemStatement.findFirst({ where: { id: input.team.problemStatementId, eventId: event.id } });
        if (!ps) throw badRequest("Unknown problem statement");
      }
    }

    // ───── Seats and price ─────
    const paid = isPaidEvent(event);
    const left = await seatsLeft(event);
    let status: RegistrationStatus = event.requiresApproval ? "REGISTERED" : "APPROVED";
    if (paid) {
      if (left < size) throw conflict(left <= 0 ? "This event is full" : `Only ${left} seat${left === 1 ? "" : "s"} left`);
      status = "PENDING_PAYMENT";
    } else if (left < size) {
      status = "WAITLISTED";
    }
    const price = paid ? priceFor(event, size, now) : null;
    const coupon = price ? await evaluateCoupon(event.id, input.couponCode, price.gross) : null;
    if (input.couponCode && paid && !coupon?.valid) throw badRequest(coupon?.message ?? "That coupon code isn't valid");
    const payConfig = getPaymentConfig(tenant);
    const finalAmount = coupon?.finalAmount ?? 0;
    if (paid && finalAmount > 0 && payConfig.mode === "NONE") throw badRequest("Online payments aren't set up for this brand yet — please contact the organisers");
    const receiptNo = paid ? await newReceiptNo(brandCode(tenant.name, "RCPT")) : null;

    // ───── Write everything at once ─────
    const involved = [user.id, ...memberUsers.map((u) => u.id)];
    const result = await prisma.$transaction(async (tx) => {
      // Remove stale team memberships left over from cancelled registrations, and teams that end up empty.
      await tx.teamMember.deleteMany({ where: { userId: { in: involved }, team: { eventId: event.id } } });
      await tx.team.deleteMany({ where: { eventId: event.id, members: { none: {} } } });
      if (input.team && (await tx.team.findUnique({ where: { eventId_name: { eventId: event.id, name: input.team.name } } }))) {
        throw conflict(`The team name "${input.team.name}" is taken — pick another`);
      }

      const upsertReg = (userId: string, data: { answers: object; addedById: string | null }) =>
        tx.registration.upsert({
          where: { eventId_userId: { eventId: event.id, userId } },
          create: { eventId: event.id, userId, status, answers: data.answers, addedById: data.addedById },
          update: { status, answers: data.answers, addedById: data.addedById, paymentId: null, checkedInAt: null, checkedInById: null },
        });
      const leaderReg = await upsertReg(user.id, { answers, addedById: null });
      const memberRegs = [];
      const memberIds: string[] = [];
      for (const m of members) {
        const u = await findOrCreateMember(tx, tenant.id, m);
        memberIds.push(u.id);
        memberRegs.push(await upsertReg(u.id, { answers: {}, addedById: user.id }));
      }
      const team = input.team
        ? await tx.team.create({
            data: {
              eventId: event.id,
              name: input.team.name,
              trackId: input.team.trackId,
              problemStatementId: input.team.problemStatementId,
              registeredAsTeam: true,
              inviteCode: teamInviteCode(),
              members: { create: [{ userId: user.id, isLeader: true }, ...memberIds.map((userId) => ({ userId }))] },
            },
          })
        : null;
      let payment: Payment | null = null;
      if (paid && price && receiptNo) {
        payment = await tx.payment.create({
          data: {
            eventId: event.id,
            userId: user.id,
            teamId: team?.id,
            provider: finalAmount === 0 ? "MANUAL" : payConfig.mode === "RAZORPAY" ? "RAZORPAY" : "DEV",
            status: "CREATED",
            amount: finalAmount,
            currency: event.currency,
            quantity: price.quantity,
            couponId: coupon?.coupon?.id,
            discount: coupon?.discount ?? 0,
            receiptNo,
            expiresAt: new Date(now.getTime() + PAYMENT_TTL_MS),
          },
        });
        await tx.registration.updateMany({ where: { id: { in: [leaderReg.id, ...memberRegs.map((r) => r.id)] } }, data: { paymentId: payment.id } });
      }
      return { leaderReg, memberRegs, team, payment };
    });

    let payment = result.payment;
    if (payment) {
      if (payment.amount === 0) {
        payment = (await markPaymentPaid(payment.id, { provider: "MANUAL", notes: "Fully covered by coupon", actorId: user.id })).payment;
      } else {
        try {
          payment = await attachOrder(payment, payConfig);
        } catch (err) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
          await prisma.registration.updateMany({ where: { paymentId: payment.id }, data: { status: "CANCELLED" } });
          throw err;
        }
      }
    } else {
      // Free event: confirmations go out now.
      const kind = status === "WAITLISTED" ? "waitlisted" : "confirmed";
      safely("registration", () => notifyRegistration(result.leaderReg.id, kind));
      for (const r of result.memberRegs) {
        if (status === "WAITLISTED") safely("registration", () => notifyRegistration(r.id, "waitlisted"));
        else safely("team.added", () => notifyTeamAdded(r.id));
      }
    }
    await logActivity(event.id, user.id, "registration.created", {
      status, ...(result.team && { teamId: result.team.id, team: result.team.name, size }), ...(payment && { paymentId: payment.id, amount: payment.amount }),
    });

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: result.leaderReg.id } });
    const team = result.team ? await prisma.team.findUnique({ where: { id: result.team.id }, include: memberInclude }) : null;
    return reply.status(201).send({ ...registration, registration, team, payment: payment ? await paymentResponse(payment) : null });
  });

  app.delete<{ Params: { id: string } }>("/events/:id/register", async (req) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const reg = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } });
    if (!reg) throw notFound("Registration");
    if (reg.status === "CHECKED_IN") throw badRequest("You've already checked in to this event");
    const updated = await prisma.registration.update({ where: { id: reg.id }, data: { status: "CANCELLED" } });
    // An unpaid order with nobody left on it is closed too.
    if (reg.paymentId) {
      const open = await prisma.registration.count({ where: { paymentId: reg.paymentId, status: { not: "CANCELLED" } } });
      if (!open) await prisma.payment.updateMany({ where: { id: reg.paymentId, status: { in: ["CREATED", "FAILED"] } }, data: { status: "EXPIRED" } });
    }
    // Promote the oldest waitlisted people when seats free up.
    if (reg.status !== "WAITLISTED") await promoteWaitlist(event.id);
    await logActivity(event.id, user.id, "registration.cancelled", {});
    return updated;
  });

  app.get("/me/registrations", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const regs = await prisma.registration.findMany({
      where: { userId: user.id, event: { tenantId: tenant.id } },
      orderBy: { event: { startsAt: "desc" } },
      include: {
        event: {
          select: {
            id: true, slug: true, title: true, type: true, mode: true, status: true, startsAt: true, endsAt: true,
            venue: true, meetingUrl: true, coverImageUrl: true, tags: true, category: CATEGORY_SELECT,
          },
        },
        payment: { select: { id: true, status: true, amount: true, currency: true, receiptNo: true, expiresAt: true, paidAt: true } },
      },
    });
    return regs.map((r) => ({ ...r, event: { ...r.event, ...eventMeta(r.event) } }));
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
      include: {
        user: {
          select: {
            id: true, name: true, email: true, phone: true, linkedinUrl: true, githubUrl: true, portfolioUrl: true,
            college: true, degree: true, graduationYear: true, city: true,
          },
        },
        payment: { select: { id: true, status: true, amount: true, currency: true, receiptNo: true } },
      },
    });
    const teamRows = await prisma.teamMember.findMany({
      where: { team: { eventId: event.id }, userId: { in: regs.map((r) => r.userId) } },
      include: { team: { select: { id: true, name: true } } },
    });
    const teamOf = new Map(teamRows.map((t) => [t.userId, { ...t.team, isLeader: t.isLeader }]));
    const memberships = await prisma.membership.findMany({
      where: { tenantId: event.tenantId, userId: { in: regs.map((r) => r.userId) } },
      include: { campus: { select: { name: true } } },
    });
    const byUser = new Map(memberships.map((m) => [m.userId, m]));
    const rows = regs.map((r) => {
      const m = byUser.get(r.userId);
      return { ...r, campus: m?.campus?.name ?? null, batch: m?.batch ?? null, rollNo: m?.rollNo ?? null, team: teamOf.get(r.userId) ?? null };
    });

    if (format === "csv") {
      const form = (event.registrationForm ?? []) as unknown as FormField[];
      const header = [
        "Name", "Email", "Phone", "College", "Course", "Graduation year", "City", "LinkedIn", "GitHub", "Portfolio",
        "Campus", "Batch", "Roll no", "Status", "Team", "Payment", "Registered at", "Checked in at", ...form.map((f) => f.label),
      ];
      const lines = rows.map((r) => {
        const answers = (r.answers ?? {}) as Record<string, unknown>;
        return [
          r.user.name, r.user.email, r.user.phone, r.user.college, r.user.degree, r.user.graduationYear, r.user.city,
          r.user.linkedinUrl, r.user.githubUrl, r.user.portfolioUrl, r.campus, r.batch, r.rollNo, r.status, r.team?.name, r.payment ? `${r.payment.status} ${r.payment.receiptNo}` : "", r.createdAt, r.checkedInAt,
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
    if (status !== reg.status && status === "APPROVED" && ["REGISTERED", "WAITLISTED"].includes(reg.status)) {
      safely("registration.approved", () => notifyRegistration(reg.id, "approved"));
    } else if (status !== reg.status && status === "WAITLISTED") {
      safely("registration.waitlisted", () => notifyRegistration(reg.id, "waitlisted"));
    }
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
