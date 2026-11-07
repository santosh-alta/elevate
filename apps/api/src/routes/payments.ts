import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canManageEvent, findEvent, requireEventManager, requireUser } from "../lib/permissions";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { seatsLeft } from "../lib/seats";
import {
  PAYMENT_TTL_MS, attachOrder, createRazorpayRefund, evaluateCoupon, getPaymentConfig, markPaymentFailed, markPaymentPaid,
  paymentResponse, priceFor, publicPayment, releasePayment, verifyPaymentSignature, verifyWebhookSignature,
} from "../lib/payments";
import { receiptToken, receiptUrl, renderReceiptPdf } from "../lib/receipt";

const paymentInclude = {
  event: { include: { tenant: true } },
  user: true,
  team: true,
  coupon: true,
} as const;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Loads a payment in the current brand (when one is resolved). */
async function loadPayment(req: FastifyRequest, id: string) {
  const p = await prisma.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!p || (req.tenant && p.event.tenantId !== req.tenant.id)) throw notFound("Payment");
  return p;
}

async function assertOwnerOrStaff(req: FastifyRequest, p: Awaited<ReturnType<typeof loadPayment>>, opts: { members?: boolean } = {}) {
  const { user } = requireUser(req);
  if (p.userId === user.id) return;
  if (opts.members && (await prisma.registration.findFirst({ where: { paymentId: p.id, userId: user.id } }))) return;
  if (await canManageEvent(req, p.event)) return;
  throw forbidden();
}

async function withRegistrations(paymentId: string) {
  const [payment, registrations] = await Promise.all([
    prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { coupon: { select: { code: true } }, team: { select: { id: true, name: true } } } }),
    prisma.registration.findMany({
      where: { paymentId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return { payment: { ...publicPayment(payment), checkout: (await paymentResponse(payment)).checkout }, registrations };
}

const couponSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - and _ only").transform((s) => s.toUpperCase()),
  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  amountOff: z.number().int().min(1).nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
});

export function paymentRoutes(app: FastifyInstance) {
  // ───────── Checkout result (Razorpay handler) ─────────
  app.post("/payments/verify", async (req) => {
    const { user } = requireUser(req);
    const body = z
      .object({ razorpay_order_id: z.string().min(1), razorpay_payment_id: z.string().min(1), razorpay_signature: z.string().min(1) })
      .parse(req.body);
    const p = await prisma.payment.findUnique({ where: { providerOrderId: body.razorpay_order_id }, include: paymentInclude });
    if (!p || (req.tenant && p.event.tenantId !== req.tenant.id)) throw notFound("Payment");
    if (p.userId !== user.id && !(await canManageEvent(req, p.event))) throw forbidden();
    const config = getPaymentConfig(p.event.tenant);
    if (!config.keySecret) throw badRequest("Payments aren't configured");
    if (!verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, config.keySecret)) {
      throw new HttpError(400, "invalid_signature", "Payment signature doesn't match");
    }
    await markPaymentPaid(p.id, { provider: "RAZORPAY", providerPaymentId: body.razorpay_payment_id, raw: body, actorId: user.id });
    return withRegistrations(p.id);
  });

  // ───────── Razorpay webhook (raw body for the signature) ─────────
  app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    scoped.post("/webhooks/razorpay", async (req) => {
      const raw = typeof req.body === "string" ? req.body : "";
      const signature = String(req.headers["x-razorpay-signature"] ?? "");
      let payload: {
        event?: string;
        payload?: {
          payment?: { entity?: { id?: string; order_id?: string; notes?: Record<string, string> } };
          order?: { entity?: { id?: string; notes?: Record<string, string> } };
          refund?: { entity?: { id?: string; payment_id?: string } };
        };
      };
      try {
        payload = JSON.parse(raw);
      } catch {
        throw badRequest("Invalid JSON body");
      }
      const pay = payload.payload?.payment?.entity;
      const order = payload.payload?.order?.entity;
      const refund = payload.payload?.refund?.entity;
      const internalId = pay?.notes?.paymentId ?? order?.notes?.paymentId;
      const orderId = pay?.order_id ?? order?.id;
      const providerPaymentId = refund?.payment_id ?? pay?.id;

      // The tenant (and so the webhook secret) comes from the payment row, not the host.
      const payment =
        (internalId && (await prisma.payment.findUnique({ where: { id: internalId }, include: paymentInclude }))) ||
        (orderId && (await prisma.payment.findUnique({ where: { providerOrderId: orderId }, include: paymentInclude }))) ||
        (providerPaymentId && (await prisma.payment.findFirst({ where: { providerPaymentId }, include: paymentInclude }))) ||
        null;
      const config = getPaymentConfig(payment?.event.tenant ?? null);
      if (!config.webhookSecret) throw badRequest("Webhook secret isn't configured");
      if (!signature || !verifyWebhookSignature(raw, signature, config.webhookSecret)) {
        throw new HttpError(400, "invalid_signature", "Webhook signature doesn't match");
      }
      if (!payment) return { ok: true, ignored: "unknown payment" };

      switch (payload.event) {
        case "payment.captured":
        case "order.paid": {
          const r = await markPaymentPaid(payment.id, { provider: "RAZORPAY", providerPaymentId: pay?.id ?? null, raw: payload });
          return { ok: true, status: r.payment.status, changed: r.changed };
        }
        case "payment.failed":
          return { ok: true, changed: await markPaymentFailed(payment.id, payload) };
        case "refund.processed":
          return { ok: true, changed: await releasePayment(payment.id, "REFUNDED") };
        default:
          return { ok: true, ignored: payload.event ?? "unknown event" };
      }
    });
  });

  // ───────── Payer actions ─────────
  app.post<{ Params: { id: string } }>("/payments/:id/dev-complete", async (req) => {
    const { user } = requireUser(req);
    const p = await loadPayment(req, req.params.id);
    if (p.userId !== user.id && !(await canManageEvent(req, p.event))) throw forbidden();
    if (process.env.NODE_ENV === "production" || p.provider !== "DEV") throw badRequest("Simulated payments are only available in development");
    if (p.status === "REFUNDED") throw conflict("This payment was refunded");
    await markPaymentPaid(p.id, { provider: "DEV", providerPaymentId: `pay_dev_${Date.now()}`, actorId: user.id });
    return withRegistrations(p.id);
  });

  app.post<{ Params: { id: string } }>("/payments/:id/retry", async (req) => {
    const { user } = requireUser(req);
    const p = await loadPayment(req, req.params.id);
    if (p.userId !== user.id) throw forbidden();
    if (p.status === "CREATED" && p.expiresAt && p.expiresAt > new Date()) return paymentResponse(p);
    if (p.status !== "FAILED" && p.status !== "EXPIRED" && p.status !== "CREATED") throw badRequest(`This payment is ${p.status.toLowerCase()}`);
    if (p.event.status !== "REGISTRATION_OPEN") throw badRequest("Registrations are closed for this event");
    const regs = await prisma.registration.findMany({ where: { paymentId: p.id } });
    if (!regs.length) throw badRequest("Nothing left to pay for — please register again");
    const reactivate = regs.filter((r) => r.status === "CANCELLED");
    if (reactivate.length) {
      const left = await seatsLeft(p.event);
      if (left < reactivate.length) throw conflict(left <= 0 ? "This event is full" : `Only ${left} seat${left === 1 ? "" : "s"} left`);
    }
    const config = getPaymentConfig(p.event.tenant);
    if (config.mode === "NONE") throw badRequest("Online payments aren't set up for this brand yet");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.registration.updateMany({ where: { id: { in: reactivate.map((r) => r.id) } }, data: { status: "PENDING_PAYMENT" } });
      return tx.payment.update({
        where: { id: p.id },
        data: {
          status: "CREATED",
          provider: config.mode === "RAZORPAY" ? "RAZORPAY" : "DEV",
          providerOrderId: null,
          providerPaymentId: null,
          expiresAt: new Date(Date.now() + PAYMENT_TTL_MS),
        },
      });
    });
    const withOrder = await attachOrder(updated, config);
    await logActivity(p.eventId, user.id, "payment.retried", { paymentId: p.id });
    return paymentResponse(withOrder);
  });

  app.get<{ Params: { id: string } }>("/payments/:id", async (req) => {
    const p = await loadPayment(req, req.params.id);
    await assertOwnerOrStaff(req, p, { members: true });
    const result = await withRegistrations(p.id);
    return {
      ...result.payment,
      event: { id: p.event.id, slug: p.event.slug, title: p.event.title, startsAt: p.event.startsAt, feeType: p.event.feeType },
      payer: { id: p.user.id, name: p.user.name, email: p.user.email },
      registrations: result.registrations,
      receiptUrl: receiptUrl(p.id),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { t?: string } }>("/payments/:id/receipt.pdf", async (req, reply) => {
    const p = await prisma.payment.findUnique({ where: { id: req.params.id }, include: paymentInclude });
    if (!p) throw notFound("Payment");
    const signed = req.query.t && req.query.t === receiptToken(p.id);
    if (!signed) {
      if (req.tenant && p.event.tenantId !== req.tenant.id) throw notFound("Payment");
      await assertOwnerOrStaff(req, p, { members: true });
    }
    const pdf = await renderReceiptPdf(p);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `inline; filename="${p.receiptNo}.pdf"`)
      .header("Cache-Control", "private, max-age=60")
      .send(Buffer.from(pdf));
  });

  // ───────── Staff ─────────
  app.get<{ Params: { id: string } }>("/events/:id/payments", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const q = z
      .object({ status: z.enum(["CREATED", "PAID", "FAILED", "EXPIRED", "REFUNDED"]).optional(), format: z.enum(["json", "csv"]).default("json") })
      .parse(req.query);
    const rows = await prisma.payment.findMany({
      where: { eventId: event.id, ...(q.status && { status: q.status }) },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        team: { select: { id: true, name: true } },
        coupon: { select: { code: true } },
        _count: { select: { registrations: true } },
      },
    });
    if (q.format === "csv") {
      const header = ["Receipt no", "Status", "Amount", "Currency", "Discount", "Coupon", "Seats", "Payer", "Email", "Phone", "Team", "Provider", "Provider payment id", "Created at", "Paid at", "Refunded at"];
      const lines = rows.map((p) =>
        [
          p.receiptNo, p.status, (p.amount / 100).toFixed(2), p.currency, (p.discount / 100).toFixed(2), p.coupon?.code, p.quantity,
          p.user.name, p.user.email, p.user.phone, p.team?.name, p.provider, p.providerPaymentId, p.createdAt, p.paidAt, p.refundedAt,
        ].map(csvCell).join(","),
      );
      return reply
        .type("text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${event.slug}-payments.csv"`)
        .send([header.map(csvCell).join(","), ...lines].join("\n"));
    }
    return rows.map(({ raw: _raw, ...p }) => ({ ...p, payer: p.user }));
  });

  app.post<{ Params: { id: string } }>("/payments/:id/mark-paid", async (req) => {
    const p = await loadPayment(req, req.params.id);
    requireUser(req);
    if (!(await canManageEvent(req, p.event))) throw forbidden();
    const { notes } = z.object({ notes: z.string().max(500).optional() }).parse(req.body ?? {});
    if (p.status === "PAID") throw conflict("This payment is already paid");
    if (p.status === "REFUNDED") throw conflict("This payment was refunded");
    await markPaymentPaid(p.id, { provider: "MANUAL", notes: notes ?? "Marked paid by staff", actorId: req.auth!.user.id });
    return withRegistrations(p.id);
  });

  app.post<{ Params: { id: string } }>("/payments/:id/refund", async (req) => {
    const p = await loadPayment(req, req.params.id);
    requireUser(req);
    if (!(await canManageEvent(req, p.event))) throw forbidden();
    const body = z.object({ amount: z.number().int().min(1).optional(), reason: z.string().max(500).optional() }).parse(req.body ?? {});
    if (p.status !== "PAID") throw badRequest("Only paid payments can be refunded");
    if (body.amount && body.amount > p.amount) throw badRequest("Refund can't be more than the amount paid");
    let refundId: string | null = null;
    if (p.provider === "RAZORPAY" && p.providerPaymentId) {
      const config = getPaymentConfig(p.event.tenant);
      if (config.mode !== "RAZORPAY") throw badRequest("Razorpay keys aren't configured");
      const refund = await createRazorpayRefund(config, p.providerPaymentId, {
        ...(body.amount && { amount: body.amount }),
        notes: { paymentId: p.id, ...(body.reason && { reason: body.reason }) },
      });
      refundId = refund.id;
    }
    const notes = [p.notes, `Refunded${body.amount ? ` ${(body.amount / 100).toFixed(2)} ${p.currency}` : ""}${body.reason ? `: ${body.reason}` : ""}${refundId ? ` (${refundId})` : ""}`]
      .filter(Boolean)
      .join(" | ");
    await releasePayment(p.id, "REFUNDED", { notes });
    await logActivity(p.eventId, req.auth!.user.id, "payment.refund", { paymentId: p.id, amount: body.amount ?? p.amount, refundId });
    return withRegistrations(p.id);
  });

  // ───────── Coupons ─────────
  app.get<{ Params: { id: string } }>("/events/:id/coupons", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.coupon.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" } });
  });

  app.post<{ Params: { id: string } }>("/events/:id/coupons", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = couponSchema.parse(req.body);
    if (!body.percentOff === !body.amountOff) throw badRequest("Give either percentOff or amountOff");
    const exists = await prisma.coupon.findUnique({ where: { eventId_code: { eventId: event.id, code: body.code } } });
    if (exists) throw conflict(`Coupon ${body.code} already exists`);
    const coupon = await prisma.coupon.create({ data: { ...body, eventId: event.id } });
    await logActivity(event.id, req.auth!.user.id, "coupon.created", { code: coupon.code });
    return reply.status(201).send(coupon);
  });

  app.patch<{ Params: { couponId: string } }>("/coupons/:couponId", async (req) => {
    const c = await prisma.coupon.findUnique({ where: { id: req.params.couponId }, include: { event: true } });
    if (!c || c.event.tenantId !== requireTenant(req).id) throw notFound("Coupon");
    requireUser(req);
    if (!(await canManageEvent(req, c.event))) throw forbidden();
    const body = couponSchema.partial().parse(req.body);
    const next = { percentOff: body.percentOff !== undefined ? body.percentOff : c.percentOff, amountOff: body.amountOff !== undefined ? body.amountOff : c.amountOff };
    if (!next.percentOff === !next.amountOff) throw badRequest("Give either percentOff or amountOff");
    const { event: _e, ...rest } = await prisma.coupon.update({ where: { id: c.id }, data: body, include: { event: true } });
    return rest;
  });

  app.delete<{ Params: { couponId: string } }>("/coupons/:couponId", async (req) => {
    const c = await prisma.coupon.findUnique({ where: { id: req.params.couponId }, include: { event: true } });
    if (!c || c.event.tenantId !== requireTenant(req).id) throw notFound("Coupon");
    requireUser(req);
    if (!(await canManageEvent(req, c.event))) throw forbidden();
    // Used coupons stay on their payments (FK is SET NULL), so deleting is safe; deactivate instead when it was used.
    if (c.usedCount > 0) {
      await prisma.coupon.update({ where: { id: c.id }, data: { active: false } });
      return { ok: true, deactivated: true };
    }
    await prisma.coupon.delete({ where: { id: c.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/events/:id/coupons/check", async (req) => {
    requireUser(req);
    const event = await findEvent(req, req.params.id);
    const { code, teamSize } = z.object({ code: z.string().trim().min(1), teamSize: z.number().int().min(1).max(50).default(1) }).parse(req.body);
    if (!event.feeAmount) return { valid: false, discount: 0, finalAmount: 0, message: "This event is free" };
    const price = priceFor(event, teamSize);
    const r = await evaluateCoupon(event.id, code, price.gross);
    return { valid: r.valid, discount: r.discount, finalAmount: r.finalAmount, grossAmount: price.gross, message: r.message };
  });
}
