import { PDFDocument, rgb, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";
import { embedBrandImage, embedFonts, hexToRgb, type PdfFont } from "./brandAssets";

/**
 * "Our own design" certificates: a designer makes the whole artwork (title, logos, signatures, wording) as one image,
 * leaving a few areas empty. We print the person's details on top, in fixed places that the designer template shows:
 *   1. the name, centred (its height on the page can be moved)
 *   2. one optional line under the name (team and award for winners, or the full "for participating in …" line)
 *   3. bottom-right corner: QR code, certificate ID, issue date and the verify link
 * Designs can be set for the whole brand or for one event, for all certificate types or one type.
 * Lookup order: event + type → event (all) → brand + type → brand (all) → the standard design.
 */
export const designSchema = z.object({
  backgroundUrl: z.string().trim().min(1).max(1000),
  nameFont: z.enum(["script", "serif", "sans"]).default("script"),
  /** Text colour as #rrggbb */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14123a"),
  /** Where the name sits, as a share of the page height from the top (0.3–0.75) */
  nameY: z.number().min(0.3).max(0.75).default(0.5),
  /** Line under the name: nothing, team/award only (winners), or the full sentence */
  line: z.enum(["none", "award", "full"]).default("award"),
  /** Which bottom corner holds the QR code, certificate ID and issue date */
  corner: z.enum(["right", "left"]).default("right"),
});
export type CertificateDesign = z.infer<typeof designSchema>;
export type DesignMap = Partial<Record<string, CertificateDesign>>;

export const PAGE = { W: 841.89, H: 595.28 };
/** The fixed areas, in PDF points from the bottom-left. Shared by the renderer and the designer template. */
export const ZONES = {
  name: { x: PAGE.W * 0.12, w: PAGE.W * 0.76, h: 70 },
  line: { gap: 34, h: 22 },
  corner: { w: 250, h: 92, inset: 30 },
};

function asMap(v: unknown): DesignMap {
  if (!v || typeof v !== "object") return {};
  const out: DesignMap = {};
  for (const [k, d] of Object.entries(v as Record<string, unknown>)) {
    const p = designSchema.safeParse(d);
    if (p.success) out[k] = p.data;
  }
  return out;
}

export function eventDesigns(config: unknown): DesignMap {
  return asMap((config as { certificateDesigns?: unknown } | null)?.certificateDesigns);
}
export function brandDesigns(settings: unknown): DesignMap {
  return asMap((settings as { certificateDesigns?: unknown } | null)?.certificateDesigns);
}

export function resolveDesign(eventConfig: unknown, tenantSettings: unknown, type: string): CertificateDesign | null {
  const e = eventDesigns(eventConfig);
  const b = brandDesigns(tenantSettings);
  return e[type] ?? e.ALL ?? b[type] ?? b.ALL ?? null;
}

export type StampData = {
  name: string;
  /** Team and award, e.g. "Team Byte Brigade · First place" */
  award?: string;
  /** The full sentence, e.g. "for participating in HackOween · 27–28 October 2026" */
  full: string;
  serial: string;
  verifyUrl: string;
  issued: string;
};

/** Draws a custom-design certificate. Returns false if the background image can't be loaded (caller falls back). */
export async function drawCustomCertificate(doc: PDFDocument, page: PDFPage, design: CertificateDesign, s: StampData): Promise<boolean> {
  const bg = await embedBrandImage(doc, design.backgroundUrl);
  if (!bg) return false;
  const { W, H } = PAGE;
  // Cover the page, keeping the image's proportions (designs made at A4 landscape fit exactly).
  const scale = Math.max(W / bg.width, H / bg.height);
  const bw = bg.width * scale;
  const bh = bg.height * scale;
  page.drawImage(bg, { x: (W - bw) / 2, y: (H - bh) / 2, width: bw, height: bh });

  const fonts = await embedFonts(doc);
  const ink = hexToRgb(design.color, rgb(0.08, 0.07, 0.23));
  const text = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB, opacity = 1) => {
    const p = f.pick(t);
    page.drawText(p.text, { x, y, size, font: p.font, color, opacity });
  };
  const fit = (t: string, f: PdfFont, start: number, min: number, max: number) => {
    let size = start;
    while (size > min && f.width(t, size) > max) size -= 0.5;
    return size;
  };

  // 1. Name, centred on the name line
  const nameFont = design.nameFont === "script" ? fonts.script : design.nameFont === "serif" ? fonts.serif : fonts.sansBold;
  const start = design.nameFont === "script" ? 56 : 40;
  const size = fit(s.name, nameFont, start, 20, ZONES.name.w);
  const baseline = H * (1 - design.nameY) - size * 0.32;
  text(s.name, (W - nameFont.width(s.name, size)) / 2, baseline, size, nameFont, ink);

  // 2. Optional line under the name
  const line = design.line === "full" ? s.full : design.line === "award" ? s.award ?? "" : "";
  if (line) {
    const ls = fit(line, fonts.sansSemi, 14, 9, ZONES.name.w);
    text(line, (W - fonts.sansSemi.width(line, ls)) / 2, baseline - ZONES.line.gap, ls, fonts.sansSemi, ink, 0.9);
  }

  // 3. Bottom-right corner: QR on a white tile, then ID / issue date / verify link to its left
  const c = ZONES.corner;
  const QR = 62;
  const tile = QR + 10;
  const left = design.corner === "left";
  const tileX = left ? c.inset : W - c.inset - tile;
  const tileY = c.inset;
  const qrPng = await QRCode.toBuffer(s.verifyUrl, { margin: 0, width: 300, color: { dark: `${design.color}ff`, light: "#ffffffff" } });
  const qr = await doc.embedPng(qrPng);
  page.drawRectangle({ x: tileX, y: tileY, width: tile, height: tile, color: rgb(1, 1, 1), opacity: 0.95 });
  page.drawImage(qr, { x: tileX + 5, y: tileY + 5, width: QR, height: QR });
  const rows: [string, PdfFont, number][] = [
    [`Certificate ID  ${s.serial}`, fonts.sansSemi, 8],
    [`Issued ${s.issued}`, fonts.sans, 8],
    [`Verify at ${s.verifyUrl.replace(/^https?:\/\//, "")}`, fonts.sans, 6.8],
  ];
  rows.forEach(([t, f, sz], i) => {
    const fs = fit(t, f, sz, 5.5, c.w - tile - 14);
    const x = left ? tileX + tile + 10 : tileX - 10 - f.width(t, fs);
    text(t, x, tileY + tile - 10 - i * 13, fs, f, ink, i === 0 ? 1 : 0.85);
  });
  return true;
}

/** A one-page guide for designers: page size, export size and the areas to leave empty. */
export async function designerTemplatePdf(brand: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${brand} certificate template`);
  doc.setAuthor(brand);
  doc.setCreator(brand);
  doc.setProducer(brand);
  const { W, H } = PAGE;
  const page = doc.addPage([W, H]);
  const fonts = await embedFonts(doc);
  const blue = rgb(0.13, 0.47, 0.85);
  const red = rgb(0.86, 0.2, 0.25);
  const grey = rgb(0.45, 0.47, 0.52);
  const ink = rgb(0.1, 0.11, 0.16);
  const text = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB) => page.drawText(f.pick(t).text, { x, y, size, font: f.pick(t).font, color });
  const centre = (t: string, y: number, size: number, f: PdfFont, color: RGB) => text(t, (W - f.width(t, size)) / 2, y, size, f, color);
  const box = (x: number, y: number, w: number, h: number, color: RGB, label: string, sub?: string) => {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: 1.2, borderDashArray: [5, 4], color, opacity: 0.07 });
    text(label, x + 8, y + h - 15, 9, fonts.sansBold, color);
    if (sub) text(sub, x + 8, y + h - 28, 7.5, fonts.sans, color);
  };

  // Light grid every 10% so the designer can line things up
  for (let i = 1; i < 10; i++) {
    page.drawLine({ start: { x: (W * i) / 10, y: 0 }, end: { x: (W * i) / 10, y: H }, thickness: 0.3, color: grey, opacity: 0.25 });
    page.drawLine({ start: { x: 0, y: (H * i) / 10 }, end: { x: W, y: (H * i) / 10 }, thickness: 0.3, color: grey, opacity: 0.25 });
  }
  page.drawRectangle({ x: 0.5, y: 0.5, width: W - 1, height: H - 1, borderColor: grey, borderWidth: 1 });

  // Instructions (top)
  centre(`${brand}: certificate design template`, H - 46, 18, fonts.sansBold, ink);
  centre("A4 landscape. Export as JPG (or PNG) at 3508 × 2480 px, under 4 MB. No bleed needed.", H - 68, 10, fonts.sans, ink);
  centre("Design everything you like (title, logos, signatures, event wording). Keep the dashed areas empty: we print those for each person.", H - 84, 9, fonts.sans, grey);

  // Name zone at the default position (50% from top), matching the renderer: name baseline ≈ 280pt, line ≈ 34pt below
  const z = ZONES.name;
  const baseline = H * 0.5 - 18;
  const nameBox = { x: z.x, y: baseline - 14, w: z.w, h: 70 };
  const lineBox = { x: z.x + 60, y: baseline - ZONES.line.gap - 8, w: z.w - 120, h: 22 };
  const dashed = (r: { x: number; y: number; w: number; h: number }, color: RGB) =>
    page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, borderColor: color, borderWidth: 1.2, borderDashArray: [5, 4], color, opacity: 0.07 });
  dashed(nameBox, blue);
  text("1. PERSON'S NAME: printed here, centred", nameBox.x, nameBox.y + nameBox.h + 14, 9, fonts.sansBold, blue);
  text("Default height is the middle of the page; it can be moved up or down per design, so leave some room around it.", nameBox.x, nameBox.y + nameBox.h + 4, 7.5, fonts.sans, blue);
  centre("Aarav Sharma", baseline, 40, fonts.script, rgb(0.35, 0.55, 0.85));
  dashed(lineBox, blue);
  centre("First place  ·  Team Byte Brigade", lineBox.y + 7, 11, fonts.sansSemi, rgb(0.35, 0.55, 0.85));
  text("2. OPTIONAL LINE: team and award, or \"for participating in …\" (can be switched off)", lineBox.x, lineBox.y - 12, 7.5, fonts.sansBold, blue);

  // Bottom-right corner
  const c = ZONES.corner;
  box(W - c.inset - c.w, c.inset - 6, c.w, c.h, red, "3. KEEP CLEAR: QR code, certificate ID,", "issue date and verify link (printed automatically)");
  text("If your design needs this corner, the same block can go bottom-left instead.", W - c.inset - c.w, c.inset + c.h + 2, 7, fonts.sans, red);

  // Tips (bottom-left)
  const tips = [
    "Tips",
    "• Signatures can go bottom-left or in the middle of the bottom edge.",
    "• Put the certificate title (e.g. Certificate of Participation) above the name area.",
    "• The event description can go below the optional line.",
    "• Use the same artwork for all types, or make one per type (Winner, Participation…).",
    "• Pick the name colour and style (script, serif or bold) when uploading.",
  ];
  tips.forEach((t, i) => text(t, 36, 132 - i * 14, i === 0 ? 10 : 8.5, i === 0 ? fonts.sansBold : fonts.sans, i === 0 ? ink : grey));

  return doc.save();
}
