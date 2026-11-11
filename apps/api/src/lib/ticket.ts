import { PDFDocument, rgb, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { Event, Registration, Tenant } from "@prisma/client";
import { EVENT_TYPE_LABELS } from "@elevate/shared";
import { themeOf } from "./brand";
import { drawGradientBar, embedBrandImage, embedFonts, hexToRgb, shade, type PdfFont } from "./brandAssets";
import { TICKET_ZONES, resolveTicketDesign } from "./ticketDesign";

/** Short, readable ticket number printed under the QR code (the last 8 characters of the ticket code). */
export function shortTicket(code: string): string {
  return code.slice(-8).toUpperCase();
}

const TZ = process.env.DISPLAY_TZ || "Asia/Kolkata";

type TicketReg = Registration & {
  event: Event & { tenant: Tenant; campuses: { campus: { name: string } }[] };
  user: { name: string; email: string };
};

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  REGISTERED: { label: "CONFIRMED", tone: "ok" }, APPROVED: { label: "CONFIRMED", tone: "ok" }, CHECKED_IN: { label: "CHECKED IN", tone: "ok" },
  WAITLISTED: { label: "WAITLISTED", tone: "warn" }, PENDING_PAYMENT: { label: "PAYMENT PENDING", tone: "warn" },
  CANCELLED: { label: "CANCELLED", tone: "bad" }, REJECTED: { label: "NOT APPROVED", tone: "bad" }, NO_SHOW: { label: "CONFIRMED", tone: "ok" },
};

/**
 * Boarding-pass style ticket in the brand's colours: event details on the left, a perforated stub with the
 * QR code (scanned at the entrance) and the short ticket number on the right.
 */
export async function renderTicketPdf(reg: TicketReg, teamName: string | null): Promise<Uint8Array> {
  const e = reg.event;
  const theme = themeOf(e.tenant);
  const c = theme.colors;
  const heroBg = hexToRgb(c.heroBg);
  const heroFg = hexToRgb(c.heroFg, rgb(1, 1, 1));
  const ink = hexToRgb(c.fg, rgb(0.06, 0.09, 0.16));
  const muted = hexToRgb(c.muted, rgb(0.42, 0.45, 0.52));
  const accent = hexToRgb(c.accent);
  const [g1, g2] = (theme.gradient ?? [c.primary, c.accent]).map((x) => hexToRgb(x));

  const W = 595.28;
  const H = 280;
  const doc = await PDFDocument.create();
  doc.setTitle(`Ticket: ${e.title}`);
  doc.setAuthor(e.tenant.name);
  doc.setCreator(e.tenant.name);
  doc.setProducer(e.tenant.name);
  const page = doc.addPage([W, H]);
  const fonts = await embedFonts(doc);
  const text = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB, opacity = 1) => {
    const p = f.pick(t);
    page.drawText(p.text, { x, y, size, font: p.font, color, opacity });
  };
  const clip = (t: string, f: PdfFont, size: number, max: number) => {
    if (f.width(t, size) <= max) return t;
    let s = t;
    while (s.length > 1 && f.width(`${s}…`, size) > max) s = s.slice(0, -1);
    return `${s}…`;
  };
  const wrap2 = (t: string, f: PdfFont, size: number, max: number) => {
    const words = t.split(/\s+/);
    let a = "";
    let i = 0;
    for (; i < words.length; i++) {
      const next = a ? `${a} ${words[i]}` : words[i];
      if (f.width(next, size) > max && a) break;
      a = next;
    }
    const b = words.slice(i).join(" ");
    return b ? [a, clip(b, f, size, max)] : [a];
  };

  const STUB = 190;
  const MAIN = W - STUB;

  // "Our own design": the uploaded artwork fills the ticket; we print details on it in fixed places.
  const custom = resolveTicketDesign(e.config, e.tenant.settings);
  const bg = custom ? await embedBrandImage(doc, custom.backgroundUrl) : null;
  let fg = ink;
  let sub = muted;
  let stubFg = ink;
  let stubSub = muted;
  const date = e.startsAt.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const sameDay = date === e.endsAt.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const where = e.mode === "ONLINE" ? "Online (link on the event page)" : [e.venue, e.campuses.map((x) => x.campus.name).join(", ")].filter(Boolean).join(", ") || "Venue on the event page";
  /** Title, type, date, time and venue from `top`; returns where the next block can start. */
  const details = (top: number, withType: boolean): number => {
    let y = top;
    for (const l of wrap2(e.title, fonts.sansBold, 17, MAIN - 56)) {
      text(l, 28, y, 17, fonts.sansBold, fg);
      y -= 21;
    }
    if (withType) {
      text(clip(EVENT_TYPE_LABELS[e.type] ?? "", fonts.sansSemi, 8, MAIN - 56).toUpperCase(), 28, y + 2, 8, fonts.sansSemi, accent);
      y -= 22;
    } else y -= 4;
    const cols: [string, string][] = [
      ["DATE", sameDay ? date : `${date} →`],
      ["TIME", sameDay ? `${t(e.startsAt)} – ${t(e.endsAt)}` : `${t(e.startsAt)} onwards`],
    ];
    cols.forEach(([k, v], i) => {
      const x = 28 + i * 180;
      text(k, x, y, 7, fonts.sansSemi, sub);
      text(clip(v, fonts.sansSemi, 10.5, 170), x, y - 14, 10.5, fonts.sansSemi, fg);
    });
    y -= 36;
    text("VENUE", 28, y, 7, fonts.sansSemi, sub);
    text(clip(where, fonts.sansSemi, 10.5, MAIN - 56), 28, y - 14, 10.5, fonts.sansSemi, fg);
    return y - 36;
  };
  const attendee = (y: number) => {
    text("ATTENDEE", 28, y, 7, fonts.sansSemi, sub);
    text(clip(reg.user.name, fonts.sansBold, 12, 220), 28, y - 15, 12, fonts.sansBold, fg);
    if (teamName) {
      text("TEAM", 268, y, 7, fonts.sansSemi, sub);
      text(clip(teamName, fonts.sansSemi, 10.5, MAIN - 296), 268, y - 14, 10.5, fonts.sansSemi, fg);
    }
  };

  if (custom && bg) {
    const sc = Math.max(W / bg.width, H / bg.height);
    page.drawImage(bg, { x: (W - bg.width * sc) / 2, y: (H - bg.height * sc) / 2, width: bg.width * sc, height: bg.height * sc });
    fg = hexToRgb(custom.color, ink);
    sub = shade(fg, 0.35);
    stubFg = hexToRgb(custom.stubColor, ink);
    stubSub = shade(stubFg, 0.35);
    if (custom.details) details(TICKET_ZONES.details.top, false);
    attendee(TICKET_ZONES.attendee.top);
  } else {
    // Background: white ticket, hero-coloured header on the main part, soft stub
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 0, y: H - 70, width: MAIN, height: 70, color: heroBg });
    page.drawCircle({ x: MAIN - 40, y: H - 12, size: 52, color: g1, opacity: 0.25 });
    drawGradientBar(page, 0, H - 74, MAIN, 4, g1, g2);
    page.drawRectangle({ x: MAIN, y: 0, width: STUB, height: H, color: shade(heroBg, 0.94) });

    // Header: logo and "EVENT TICKET"
    const logo = await embedBrandImage(doc, theme.logoDarkUrl ?? theme.logoUrl);
    if (logo) {
      const lh = 26;
      const lw = Math.min(150, (logo.width / logo.height) * lh);
      page.drawImage(logo, { x: 28, y: H - 22 - (logo.height / logo.width) * lw, width: lw, height: (logo.height / logo.width) * lw });
    } else text(e.tenant.name, 28, H - 42, 13, fonts.sansBold, heroFg);
    const kicker = "EVENT TICKET";
    text(kicker, MAIN - 28 - fonts.sansBold.width(kicker, 8.5), H - 40, 8.5, fonts.sansBold, heroFg, 0.85);

    // Event title and details
    attendee(details(H - 104, true));

    // Perforation: dashed line with half-circle notches
    for (let py = 8; py < H - 8; py += 9) page.drawLine({ start: { x: MAIN, y: py }, end: { x: MAIN, y: py + 4.5 }, thickness: 1, color: shade(muted, 0.4) });
    page.drawCircle({ x: MAIN, y: H, size: 11, color: rgb(1, 1, 1) });
    page.drawCircle({ x: MAIN, y: 0, size: 11, color: rgb(1, 1, 1) });
  }

  // Stub: status, QR and ticket number
  const st = STATUS[reg.status] ?? { label: reg.status, tone: "warn" as const };
  const toneCol = st.tone === "ok" ? rgb(0.06, 0.55, 0.35) : st.tone === "warn" ? rgb(0.8, 0.5, 0.05) : rgb(0.8, 0.2, 0.2);
  const pillW = fonts.sansBold.width(st.label, 7.5) + 16;
  const cx = MAIN + STUB / 2;
  page.drawRectangle({ x: cx - pillW / 2, y: H - 40, width: pillW, height: 15, color: shade(toneCol, 0.85) });
  text(st.label, cx - pillW / 2 + 8, H - 35.5, 7.5, fonts.sansBold, toneCol);

  const QR = 128;
  const png = await QRCode.toBuffer(reg.ticketCode, { width: 512, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000ff", light: "#ffffffff" } });
  const qr = await doc.embedPng(png);
  page.drawRectangle({ x: cx - QR / 2 - 6, y: H - 60 - QR - 12, width: QR + 12, height: QR + 12, color: rgb(1, 1, 1) });
  page.drawImage(qr, { x: cx - QR / 2, y: H - 60 - QR - 6, width: QR, height: QR });
  const label = "TICKET NO.";
  text(label, cx - fonts.sansSemi.width(label, 7) / 2, 62, 7, fonts.sansSemi, stubSub);
  const code = shortTicket(reg.ticketCode);
  text(code, cx - fonts.sansBold.width(code, 14) / 2, 45, 14, fonts.sansBold, stubFg);
  const hint = st.tone === "ok" ? "Show this QR at the entrance" : reg.status === "PENDING_PAYMENT" ? "Complete payment to confirm" : "Not valid for entry yet";
  text(hint, cx - fonts.sans.width(hint, 7.5) / 2, 26, 7.5, fonts.sans, stubSub);

  return doc.save();
}
