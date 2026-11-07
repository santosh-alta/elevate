import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Coupon, Event, Payment, PaymentProvider, Prisma, PrismaClient, Tenant } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { HttpError, badRequest, conflict } from "./errors";
import { secureCode } from "./codes";
import { logActivity } from "./activity";
import { notifyPayment, notifyRegistration, notifyTeamAdded, safely } from "./notify";
import { promoteWaitlist } from "./seats";

type Db = PrismaClient | Prisma.TransactionClient;

export const PAYMENT_TTL_MS = 30 * 60 * 1000;
const RAZORPAY_API = "https://api.razorpay.com/v1";

// ───────── Configuration ─────────

export interface PaymentConfig {
  /** RAZORPAY when keys are configured; DEV (simulated) when not, outside production; NONE in production without keys. */
  mode: "RAZORPAY" | "DEV" | "NONE";
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
}

interface TenantPaymentSettings {
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
}

/** Env keys, overridden per brand by Tenant.settings.payments. */
export function getPaymentConfig(tenant: Pick<Tenant, "settings"> | null): PaymentConfig {
  const s = (((tenant?.settings ?? {}) as Record<string, unknown>).payments ?? {}) as TenantPaymentSettings;
  const keyId = s.razorpayKeyId || process.env.RAZORPAY_KEY_ID || null;
  const keySecret = s.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || null;
  const webhookSecret = s.razorpayWebhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || null;
  const mode = keyId && keySecret ? "RAZORPAY" : process.env.NODE_ENV !== "production" ? "DEV" : "NONE";
  return { mode, keyId, keySecret, webhookSecret };
}

/** Tenant settings without payment secrets (for any response that echoes settings). */
export function redactSettings(settings: unknown): Record<string, unknown> {
  const s = { ...((settings ?? {}) as Record<string, unknown>) };
  if (s.payments && typeof s.payments === "object") {
    const p = s.payments as TenantPaymentSettings;
    s.payments = { razorpayKeyId: p.razorpayKeyId ?? null, hasKeySecret: !!p.razorpayKeySecret, hasWebhookSecret: !!p.razorpayWebhookSecret };
  }
  return s;
}

// ───────── Signatures ─────────

function hmacHex(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given ?? "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout handler signature: HMAC-SHA256(`order_id|payment_id`, keySecret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  return safeEqualHex(hmacHex(`${orderId}|${paymentId}`, keySecret), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhookSecret). */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
}

// ───────── Razorpay REST (no SDK) ─────────

async function razorpay<T>(config: PaymentConfig, path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${RAZORPAY_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new HttpError(502, "payment_provider_error", `Couldn't reach the payment provider: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) {
    throw new HttpError(502, "payment_provider_error", json.error?.description ?? `Payment provider error (${res.status})`);
  }
  return json;
}

export async function createRazorpayOrder(
  config: PaymentConfig,
  input: { amount: number; currency: string; receipt: string; notes: Record<string, string> },
): Promise<{ id: string }> {
  return razorpay<{ id: string }>(config, "/orders", input);
}

export async function createRazorpayRefund(
  config: PaymentConfig,
  providerPaymentId: string,
  input: { amount?: number; notes?: Record<string, string> },
): Promise<{ id: string; status?: string }> {
  return razorpay<{ id: string; status?: string }>(config, `/payments/${encodeURIComponent(providerPaymentId)}/refund`, input);
}

// ───────── Pricing & coupons ─────────

export interface Price {
  unitAmount: number;
  quantity: number;
  gross: number;
  earlyBird: boolean;
}

export function isPaidEvent(event: Pick<Event, "feeAmount">): boolean {
  return !!event.feeAmount && event.feeAmount > 0;
}

/** Current per-unit fee: early-bird price until earlyBirdEndsAt, then the normal fee. */
export function currentFee(event: Pick<Event, "feeAmount" | "earlyBirdAmount" | "earlyBirdEndsAt">, now = new Date()): { amount: number; earlyBird: boolean } {
  const earlyBird = event.earlyBirdAmount !== null && event.earlyBirdAmount !== undefined && !!event.earlyBirdEndsAt && now < event.earlyBirdEndsAt;
  return { amount: earlyBird ? event.earlyBirdAmount! : event.feeAmount ?? 0, earlyBird };
}

export function priceFor(event: Pick<Event, "feeAmount" | "earlyBirdAmount" | "earlyBirdEndsAt" | "feeType">, seats: number, now = new Date()): Price {
  const fee = currentFee(event, now);
  const quantity = event.feeType === "PER_TEAM" ? 1 : Math.max(1, seats);
  return { unitAmount: fee.amount, quantity, gross: fee.amount * quantity, earlyBird: fee.earlyBird };
}

export interface CouponResult {
  valid: boolean;
  coupon: Coupon | null;
  discount: number;
  finalAmount: number;
  message?: string;
}

export async function evaluateCoupon(eventId: string, code: string | undefined | null, gross: number, db: Db = prisma): Promise<CouponResult> {
  if (!code?.trim()) return { valid: false, coupon: null, discount: 0, finalAmount: gross };
  const coupon = await db.coupon.findUnique({ where: { eventId_code: { eventId, code: code.trim().toUpperCase() } } });
  const invalid = (message: string): CouponResult => ({ valid: false, coupon: null, discount: 0, finalAmount: gross, message });
  if (!coupon || !coupon.active) return invalid("That coupon code isn't valid for this event");
  if (coupon.validUntil && coupon.validUntil < new Date()) return invalid("That coupon has expired");
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return invalid("That coupon has been fully used");
  const discount = Math.min(gross, coupon.percentOff ? Math.round((gross * coupon.percentOff) / 100) : coupon.amountOff ?? 0);
  return { valid: true, coupon, discount, finalAmount: gross - discount, message: `${coupon.code} applied` };
}

/** Human-friendly unique receipt number, e.g. ELV-2026-004821. */
export async function newReceiptNo(db: Db = prisma): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 8; i++) {
    const candidate = `ELV-${year}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    if (!(await db.payment.findUnique({ where: { receiptNo: candidate }, select: { id: true } }))) return candidate;
  }
  return `ELV-${year}-${secureCode(8)}`;
}

// ───────── Orders & checkout ─────────

export type Checkout = {
  dev?: true;
  keyId: string | null;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string | null };
};

/** Creates the provider order for a CREATED payment and stores its id. */
export async function attachOrder(payment: Payment, config: PaymentConfig): Promise<Payment> {
  if (payment.provider === "DEV") {
    return prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: `order_dev_${secureCode(14)}` } });
  }
  if (payment.provider !== "RAZORPAY") return payment;
  const order = await createRazorpayOrder(config, {
    amount: payment.amount,
    currency: payment.currency,
    receipt: payment.receiptNo,
    notes: { paymentId: payment.id, eventId: payment.eventId },
  });
  return prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: order.id } });
}

export async function checkoutFor(paymentId: string): Promise<Checkout | null> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { user: true, event: { include: { tenant: true } } } });
  if (!p || p.status !== "CREATED" || !p.providerOrderId) return null;
  if (p.expiresAt && p.expiresAt < new Date()) return null;
  if (p.provider !== "RAZORPAY" && p.provider !== "DEV") return null;
  const config = getPaymentConfig(p.event.tenant);
  return {
    ...(p.provider === "DEV" && { dev: true as const }),
    keyId: p.provider === "RAZORPAY" ? config.keyId : null,
    orderId: p.providerOrderId,
    amount: p.amount,
    currency: p.currency,
    name: p.event.tenant.name,
    description: p.quantity > 1 ? `${p.event.title} (${p.quantity} seats)` : p.event.title,
    prefill: { name: p.user.name, email: p.user.email, contact: p.user.phone },
  };
}

/** Payment as returned to clients (no raw provider payload). */
export function publicPayment(p: Payment) {
  const { raw: _raw, ...rest } = p;
  return rest;
}

export async function paymentResponse(p: Payment) {
  return {
    id: p.id, status: p.status, amount: p.amount, currency: p.currency, receiptNo: p.receiptNo, provider: p.provider,
    quantity: p.quantity, discount: p.discount, expiresAt: p.expiresAt, paidAt: p.paidAt,
    checkout: await checkoutFor(p.id),
  };
}

// ───────── State changes ─────────

/**
 * Marks a payment PAID (idempotent) and confirms its registrations:
 * PENDING_PAYMENT → APPROVED (REGISTERED when approval is needed). Sends the receipt and confirmation emails.
 */
export async function markPaymentPaid(
  paymentId: string,
  opts: { provider?: PaymentProvider; providerPaymentId?: string | null; notes?: string | null; raw?: unknown; actorId?: string | null } = {},
): Promise<{ payment: Payment; changed: boolean }> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { event: true } });
  if (!payment) throw badRequest("Unknown payment");
  if (payment.status === "PAID") return { payment, changed: false };
  if (payment.status === "REFUNDED") throw conflict("This payment was refunded");
  const regStatus = payment.event.requiresApproval ? "REGISTERED" : "APPROVED";
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: ["CREATED", "FAILED", "EXPIRED"] } },
      data: {
        status: "PAID",
        paidAt: now,
        ...(opts.provider && { provider: opts.provider }),
        ...(opts.providerPaymentId && { providerPaymentId: opts.providerPaymentId }),
        ...(opts.notes && { notes: opts.notes }),
        ...(opts.raw !== undefined && { raw: JSON.parse(JSON.stringify(opts.raw)) as Prisma.InputJsonValue }),
      },
    });
    if (!res.count) return null; // someone else got there first
    await tx.registration.updateMany({
      where: { paymentId, status: { in: ["PENDING_PAYMENT", "CANCELLED"] } },
      data: { status: regStatus },
    });
    if (payment.couponId) await tx.coupon.update({ where: { id: payment.couponId }, data: { usedCount: { increment: 1 } } });
    return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  });
  if (!updated) return { payment: await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }), changed: false };

  await logActivity(payment.eventId, opts.actorId ?? payment.userId, "payment.paid", {
    paymentId, amount: payment.amount, receiptNo: payment.receiptNo, provider: updated.provider,
  });
  safely("payment.receipt", () => notifyPayment(paymentId, "receipt"));
  const regs = await prisma.registration.findMany({ where: { paymentId } });
  for (const r of regs) {
    if (r.userId !== payment.userId && r.addedById) safely("team.added", () => notifyTeamAdded(r.id));
    else safely("registration.confirmed", () => notifyRegistration(r.id, "confirmed"));
  }
  return { payment: updated, changed: true };
}

export async function markPaymentFailed(paymentId: string, raw?: unknown): Promise<boolean> {
  const res = await prisma.payment.updateMany({
    where: { id: paymentId, status: "CREATED" },
    data: { status: "FAILED", ...(raw !== undefined && { raw: JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue }) },
  });
  if (res.count) safely("payment.failed", () => notifyPayment(paymentId, "failed"));
  return res.count > 0;
}

/**
 * Cancels a payment's registrations (EXPIRED or REFUNDED) and frees the seats.
 * Team rows are kept on expiry (a retry restores them); refunds also remove the members from the team.
 */
export async function releasePayment(paymentId: string, status: "EXPIRED" | "REFUNDED", extra: Prisma.PaymentUpdateManyMutationInput = {}): Promise<boolean> {
  const from = status === "EXPIRED" ? (["CREATED"] as const) : (["PAID", "CREATED", "FAILED"] as const);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return false;
  const changed = await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: [...from] } },
      data: { status, ...(status === "REFUNDED" && { refundedAt: new Date() }), ...extra },
    });
    if (!res.count) return false;
    const regs = await tx.registration.findMany({ where: { paymentId, status: { notIn: ["CANCELLED", "REJECTED"] } } });
    await tx.registration.updateMany({ where: { id: { in: regs.map((r) => r.id) } }, data: { status: "CANCELLED" } });
    if (status === "REFUNDED" && payment.teamId) {
      await tx.teamMember.deleteMany({ where: { teamId: payment.teamId, userId: { in: regs.map((r) => r.userId) } } });
      const left = await tx.teamMember.count({ where: { teamId: payment.teamId } });
      if (!left) await tx.team.delete({ where: { id: payment.teamId } });
    }
    return true;
  });
  if (!changed) return false;
  await logActivity(payment.eventId, null, status === "EXPIRED" ? "payment.expired" : "payment.refunded", { paymentId, receiptNo: payment.receiptNo });
  if (status === "EXPIRED") safely("payment.expired", () => notifyPayment(paymentId, "expired"));
  await promoteWaitlist(payment.eventId);
  return true;
}

/** Worker: CREATED payments past expiresAt → EXPIRED, their registrations → CANCELLED. */
export async function expireDuePayments(now = new Date()): Promise<number> {
  const due = await prisma.payment.findMany({ where: { status: "CREATED", expiresAt: { lt: now } }, select: { id: true }, take: 200 });
  let n = 0;
  for (const p of due) if (await releasePayment(p.id, "EXPIRED")) n++;
  return n;
}

export async function revenueFor(where: Prisma.PaymentWhereInput) {
  const groups = await prisma.payment.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true });
  const sum = (s: string) => groups.find((g) => g.status === s)?._sum.amount ?? 0;
  return {
    paid: sum("PAID"),
    refunded: sum("REFUNDED"),
    pending: sum("CREATED"),
    count: groups.find((g) => g.status === "PAID")?._count ?? 0,
  };
}
