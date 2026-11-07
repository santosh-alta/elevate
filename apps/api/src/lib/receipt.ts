import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { Coupon, Event, Payment, Team, Tenant, User } from "@prisma/client";
import { createHmac } from "node:crypto";
import { apiBaseUrl, themeOf } from "./brand";

/** Signed token for receipt links in emails (opened without a login). */
export function receiptToken(paymentId: string): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "dev-secret").update(`receipt:${paymentId}`).digest("base64url").slice(0, 32);
}

export function receiptUrl(paymentId: string): string {
  return `${apiBaseUrl()}/v1/payments/${paymentId}/receipt.pdf?t=${receiptToken(paymentId)}`;
}

export type PaymentForReceipt = Payment & {
  event: Event & { tenant: Tenant };
  user: User;
  team: Team | null;
  coupon: Coupon | null;
};

function hexToRgb(hex: string, fallback: RGB = rgb(0.15, 0.39, 0.92)): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** WinAnsi-safe text for the standard PDF fonts (no ₹ glyph, so amounts are written as "INR 499.00"). */
function safe(text: string): string {
  return text.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export function money(amount: number, currency: string): string {
  return `${currency} ${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "PAID", CREATED: "AWAITING PAYMENT", FAILED: "FAILED", EXPIRED: "EXPIRED", REFUNDED: "REFUNDED",
};

/** A4 portrait receipt in the brand's colours. */
export async function renderReceiptPdf(p: PaymentForReceipt): Promise<Uint8Array> {
  const tenant = p.event.tenant;
  const theme = themeOf(tenant);
  const primary = hexToRgb(theme.colors.primary);
  const ink = hexToRgb(theme.colors.fg, rgb(0.06, 0.09, 0.16));
  const muted = hexToRgb(theme.colors.muted, rgb(0.4, 0.45, 0.53));
  const line = rgb(0.88, 0.9, 0.93);

  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${p.receiptNo}`);
  doc.setAuthor(tenant.name);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 56;
  const right = width - 56;

  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: primary });
  page.drawText(safe(tenant.name), { x: left, y: height - 60, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Payment receipt", { x: left, y: height - 85, size: 12, font: regular, color: rgb(1, 1, 1) });
  const status = STATUS_LABEL[p.status] ?? p.status;
  const sw = bold.widthOfTextAtSize(status, 12);
  page.drawText(status, { x: right - sw, y: height - 60, size: 12, font: bold, color: rgb(1, 1, 1) });

  let y = height - 160;
  const row = (label: string, value: string | null | undefined, opts: { strong?: boolean } = {}) => {
    if (value === null || value === undefined || value === "") return;
    page.drawText(safe(label), { x: left, y, size: 10, font: regular, color: muted });
    const v = safe(value);
    const font = opts.strong ? bold : regular;
    const size = opts.strong ? 12 : 11;
    // Right-align, shrinking long values to fit.
    let s = size;
    while (s > 7 && font.widthOfTextAtSize(v, s) > right - left - 160) s -= 0.5;
    page.drawText(v, { x: right - font.widthOfTextAtSize(v, s), y, size: s, font, color: ink });
    y -= 24;
  };
  const rule = () => {
    page.drawLine({ start: { x: left, y: y + 10 }, end: { x: right, y: y + 10 }, thickness: 1, color: line });
    y -= 10;
  };

  const date = (d: Date | null) =>
    d ? d.toLocaleString("en-IN", { timeZone: process.env.DISPLAY_TZ ?? "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  row("Receipt no.", p.receiptNo, { strong: true });
  row("Date", date(p.paidAt ?? p.createdAt));
  rule();
  row("Event", p.event.title);
  row("Event date", date(p.event.startsAt));
  if (p.team) row("Team", p.team.name);
  rule();
  row("Paid by", p.user.name);
  row("Email", p.user.email);
  row("Phone", p.user.phone);
  rule();
  const gross = p.amount + p.discount;
  const unit = p.quantity > 0 ? Math.round(gross / p.quantity) : gross;
  row(
    p.event.feeType === "PER_TEAM" ? "Registration fee (per team)" : `Registration fee x ${p.quantity}`,
    p.quantity > 1 ? `${money(unit, p.currency)} x ${p.quantity} = ${money(gross, p.currency)}` : money(gross, p.currency),
  );
  if (p.discount) row(`Coupon${p.coupon ? ` ${p.coupon.code}` : ""}`, `- ${money(p.discount, p.currency)}`);
  row("Total", money(p.amount, p.currency), { strong: true });
  rule();
  row("Payment method", p.provider === "RAZORPAY" ? "Razorpay" : p.provider === "DEV" ? "Test payment (development)" : "Offline (cash / bank transfer)");
  row("Razorpay payment id", p.providerPaymentId);
  row("Order id", p.provider === "RAZORPAY" ? p.providerOrderId : null);
  if (p.status === "REFUNDED") row("Refunded on", date(p.refundedAt));
  if (p.notes) row("Notes", p.notes.slice(0, 80));

  page.drawText(safe(`This is a computer-generated receipt from ${tenant.name}. No signature is required.`), {
    x: left, y: 70, size: 9, font: regular, color: muted,
  });
  page.drawText("Powered by Elevate", { x: left, y: 56, size: 8, font: regular, color: muted });
  return doc.save();
}
