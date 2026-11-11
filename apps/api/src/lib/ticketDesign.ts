import { PDFDocument, rgb, type RGB } from "pdf-lib";
import { z } from "zod";
import { embedFonts, type PdfFont } from "./brandAssets";

/**
 * "Our own design" tickets: the designer makes the whole ticket artwork; we print on top, in fixed places:
 *   1. attendee name and team (bottom-left)
 *   2. optionally the event title, date, time and venue (middle-left) — off when the artwork already has them
 *   3. the right stub: status, QR code and ticket number (keep it free of content; a background colour is fine)
 * Set for the whole brand or for one event; the event's design wins.
 */
export const ticketDesignSchema = z.object({
  backgroundUrl: z.string().trim().min(1).max(1000),
  /** Text colour as #rrggbb */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14123a"),
  /** Text colour on the right stub (ticket number), which often has a different background */
  stubColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14123a"),
  /** Print the event title, date, time and venue */
  details: z.boolean().default(false),
});
export type TicketDesign = z.infer<typeof ticketDesignSchema>;

export const TICKET = { W: 595.28, H: 280, STUB: 190, PX: { w: 2480, h: 1167 } };
/** Baselines (PDF points from the bottom) shared by the renderer and the designer template */
export const TICKET_ZONES = { details: { top: 176 }, attendee: { top: 62 }, header: 88 };

function parse(v: unknown): TicketDesign | null {
  const p = ticketDesignSchema.safeParse(v);
  return p.success ? p.data : null;
}
export const eventTicketDesign = (config: unknown) => parse((config as { ticketDesign?: unknown } | null)?.ticketDesign);
export const brandTicketDesign = (settings: unknown) => parse((settings as { ticketDesign?: unknown } | null)?.ticketDesign);
export function resolveTicketDesign(config: unknown, settings: unknown): TicketDesign | null {
  return eventTicketDesign(config) ?? brandTicketDesign(settings);
}

/** Two pages for designers: the layout at true proportions, then the export settings and tips. */
export async function ticketTemplatePdf(brand: string): Promise<Uint8Array> {
  const { W, H, STUB } = TICKET;
  const MAIN = W - STUB;
  const doc = await PDFDocument.create();
  doc.setTitle(`${brand} ticket template`);
  doc.setAuthor(brand);
  doc.setCreator(brand);
  doc.setProducer(brand);
  const fonts = await embedFonts(doc);
  const blue = rgb(0.13, 0.47, 0.85);
  const red = rgb(0.86, 0.2, 0.25);
  const green = rgb(0.1, 0.55, 0.35);
  const grey = rgb(0.45, 0.47, 0.52);
  const ink = rgb(0.1, 0.11, 0.16);

  // Page 1: layout
  const page = doc.addPage([W, H]);
  const text = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB) => page.drawText(f.pick(t).text, { x, y, size, font: f.pick(t).font, color });
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1), borderColor: grey, borderWidth: 1 });
  const zone = (x: number, y: number, w: number, h: number, color: RGB, title: string, sub: string) => {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: 1.1, borderDashArray: [5, 4], color, opacity: 0.07 });
    text(title, x + 7, y + h - 13, 8, fonts.sansBold, color);
    text(sub, x + 7, y + h - 24, 6.5, fonts.sans, color);
  };
  const z = TICKET_ZONES;
  zone(10, H - z.header + 4, MAIN - 20, z.header - 14, green, "YOUR ARTWORK: logo, event name, branding", "Design freely here and anywhere outside the dashed boxes below.");
  zone(20, 80, MAIN - 40, z.details.top + 14 - 80, blue, "2. EVENT DETAILS (optional)", "Title, date, time and venue. Leave empty only if you'll switch \"print event details\" on.");
  zone(20, 22, MAIN - 40, z.attendee.top + 10 - 22, blue, "1. ATTENDEE NAME AND TEAM", "Printed for each person. Always keep this area empty.");
  zone(MAIN + 12, 12, STUB - 24, H - 24, red, "3. KEEP CLEAR", "Status, QR code and ticket no.");
  for (let py = 8; py < H - 8; py += 9) page.drawLine({ start: { x: MAIN, y: py }, end: { x: MAIN, y: py + 4.5 }, thickness: 0.8, color: grey });
  // sample QR outline in the stub
  page.drawRectangle({ x: MAIN + STUB / 2 - 70, y: H - 60 - 140, width: 140, height: 140, borderColor: red, borderWidth: 0.8, opacity: 0 });
  text("QR", MAIN + STUB / 2 - 8, H - 135, 14, fonts.sansBold, red);
  text("TICKET NO.", MAIN + STUB / 2 - 20, 62, 7, fonts.sansSemi, red);

  // Page 2: instructions
  const p2 = doc.addPage([W, H]);
  const t2 = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB) => p2.drawText(f.pick(t).text, { x, y, size, font: f.pick(t).font, color });
  p2.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  t2(`${brand}: ticket design template`, 28, H - 40, 15, fonts.sansBold, ink);
  const lines = [
    `Size: ${TICKET.PX.w} × ${TICKET.PX.h} px (same shape as page 1). Export as JPG or PNG, under 4 MB.`,
    "The right part (about one third, 190 of 595 units) is the stub: background colour or pattern only.",
    "We print the person's name and team at the bottom-left, and the status, QR code and ticket number on the stub.",
    "Make one design for all events, or one per event (with the event name and date already in the artwork).",
    "If the design doesn't include the event details, switch on \"Print event details\" when uploading.",
    "Pick text colours that read well on your artwork (dark on light, white on dark); the stub has its own colour.",
    "Keep important artwork away from the very edges (about 30 px), in case of printing.",
  ];
  lines.forEach((l, i) => {
    p2.drawCircle({ x: 32, y: H - 70 - i * 24 + 3, size: 1.8, color: blue });
    t2(l, 42, H - 70 - i * 24, 9, fonts.sans, ink);
  });
  return doc.save();
}
