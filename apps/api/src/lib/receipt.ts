import { PDFDocument, rgb, type RGB } from "pdf-lib";
import type { Coupon, Event, Payment, Team, Tenant, User } from "@prisma/client";
import { createHmac } from "node:crypto";
import { apiBaseUrl, settingsOf, themeOf } from "./brand";
import { drawGradientBar, embedBrandImage, embedFonts, hexToRgb, roundedRectPath, type PdfFont } from "./brandAssets";

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

export function money(amount: number, currency: string): string {
  return `${currency} ${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "PAID", CREATED: "AWAITING PAYMENT", FAILED: "FAILED", EXPIRED: "EXPIRED", REFUNDED: "REFUNDED",
};

/** A4 portrait receipt in the brand's colours: hero-coloured header with the logo, gradient rule, amount, line items. */
export async function renderReceiptPdf(p: PaymentForReceipt): Promise<Uint8Array> {
  const tenant = p.event.tenant;
  const theme = themeOf(tenant);
  const settings = settingsOf(tenant);
  const c = theme.colors;
  const heroBg = hexToRgb(c.heroBg);
  const heroFg = hexToRgb(c.heroFg, rgb(1, 1, 1));
  const ink = hexToRgb(c.fg, rgb(0.06, 0.09, 0.16));
  const muted = hexToRgb(c.muted, rgb(0.4, 0.45, 0.53));
  const line = hexToRgb(c.border, rgb(0.88, 0.9, 0.93));
  const [g1, g2] = theme.gradient ?? [c.primary, c.accent];

  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${p.receiptNo}`);
  doc.setAuthor(tenant.name);
  doc.setCreator(tenant.name);
  doc.setProducer(tenant.name);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const fonts = await embedFonts(doc);
  const left = 56;
  const right = width - 56;

  const text = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB, opacity = 1) => {
    const picked = f.pick(t);
    page.drawText(picked.text, { x, y, size, font: picked.font, color, opacity });
  };
  const textRight = (t: string, xr: number, y: number, size: number, f: PdfFont, color: RGB, opacity = 1) =>
    text(t, xr - f.width(t, size), y, size, f, color, opacity);

  // Header band
  const BAND = 104;
  page.drawRectangle({ x: 0, y: height - BAND, width, height: BAND, color: heroBg });
  drawGradientBar(page, 0, height - BAND - 4, width, 4, hexToRgb(g1), hexToRgb(g2));
  const logo = await embedBrandImage(doc, theme.logoDarkUrl ?? theme.logoUrl);
  if (logo) {
    const lh = Math.min(42, (logo.height / logo.width) * 170);
    const lw = (logo.width / logo.height) * lh;
    page.drawImage(logo, { x: left, y: height - BAND / 2 - lh / 2, width: lw, height: lh });
  } else {
    text(tenant.name, left, height - BAND / 2 - 8, 22, fonts.sansBold, heroFg);
  }
  textRight("PAYMENT RECEIPT", right, height - 46, 9, fonts.sansSemi, heroFg, 0.75);
  textRight(p.receiptNo ?? "", right, height - 66, 14, fonts.sansBold, heroFg);

  // Status pill and amount
  const status = STATUS_LABEL[p.status] ?? p.status;
  const paid = p.status === "PAID";
  const pillBg = paid ? hexToRgb(c.secondary) : p.status === "CREATED" ? hexToRgb(c.highlight) : hexToRgb(c.muted);
  const pillFg = paid ? hexToRgb(c.secondaryFg, rgb(1, 1, 1)) : p.status === "CREATED" ? ink : rgb(1, 1, 1);
  const pw = fonts.sansBold.width(status, 9) + 22;
  let y = height - BAND - 46;
  page.drawSvgPath(roundedRectPath(left, y - 6, pw, 20, 10), { x: 0, y: 0, color: pillBg });
  text(status, left + 11, y, 9, fonts.sansBold, pillFg);
  y -= 38;
  text(p.status === "REFUNDED" ? "Amount refunded" : paid ? "Amount paid" : "Amount", left, y + 4, 10, fonts.sans, muted);
  y -= 30;
  text(money(p.amount, p.currency), left, y, 28, fonts.sansBold, ink);
  y -= 38;

  const row = (label: string, value: string | null | undefined, opts: { strong?: boolean } = {}) => {
    if (value === null || value === undefined || value === "") return;
    text(label, left, y, 10, fonts.sans, muted);
    const f = opts.strong ? fonts.sansBold : fonts.sans;
    let s = opts.strong ? 12 : 11;
    while (s > 7 && f.width(value, s) > right - left - 160) s -= 0.5;
    textRight(value, right, y, s, f, ink);
    y -= 24;
  };
  const rule = () => {
    page.drawLine({ start: { x: left, y: y + 10 }, end: { x: right, y: y + 10 }, thickness: 0.8, color: line });
    y -= 10;
  };
  const section = (label: string) => {
    y -= 6;
    text(label.toUpperCase(), left, y, 8.5, fonts.sansSemi, hexToRgb(c.accent));
    y -= 20;
  };

  const date = (d: Date | null) =>
    d ? d.toLocaleString("en-IN", { timeZone: process.env.DISPLAY_TZ ?? "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  rule();
  row("Receipt no.", p.receiptNo, { strong: true });
  row("Date", date(p.paidAt ?? p.createdAt));
  rule();
  section("Event");
  row("Event", p.event.title);
  row("Event date", date(p.event.startsAt));
  if (p.team) row("Team", p.team.name);
  rule();
  section("Billed to");
  row("Paid by", p.user.name);
  row("Email", p.user.email);
  row("Phone", p.user.phone);
  rule();
  section("Payment");
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

  // Footer
  drawGradientBar(page, left, 104, right - left, 2, hexToRgb(g1), hexToRgb(g2));
  const contact = [settings.website?.replace(/^https?:\/\//, "").replace(/\/$/, ""), settings.supportEmail, settings.phone].filter(Boolean).join("   |   ");
  if (contact) text(contact, left, 84, 9, fonts.sansSemi, ink);
  text(`This is a computer-generated receipt from ${tenant.name}. No signature is required.`, left, contact ? 68 : 84, 8.5, fonts.sans, muted);
  return doc.save();
}
