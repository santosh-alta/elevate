import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type RGB } from "pdf-lib";

/**
 * Brand assets for emails and PDFs. Theme URLs may be site-relative ("/brands/altaschool/logo.png"):
 * the web app serves those from apps/web/public, so PDFs read them from disk and emails link them on the brand's domain.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_PUBLIC_DIR = process.env.WEB_PUBLIC_DIR ?? path.resolve(HERE, "../../../web/public");
const FONTS_DIR = process.env.PDF_FONTS_DIR ?? path.resolve(HERE, "../../assets/fonts");

export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Absolute URL for a theme asset: relative paths are resolved against the brand's public web URL. */
export function absoluteAssetUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url) return undefined;
  if (isAbsoluteUrl(url) || url.startsWith("data:")) return url;
  return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

const imageCache = new Map<string, Promise<Uint8Array | null>>();

/** Bytes of a brand image (PNG/JPEG): from the web public dir for relative URLs, fetched for absolute ones. Cached; null on failure. */
export function loadBrandImage(url: string | undefined): Promise<Uint8Array | null> {
  if (!url) return Promise.resolve(null);
  let hit = imageCache.get(url);
  if (!hit) {
    hit = (async () => {
      try {
        if (isAbsoluteUrl(url)) {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return null;
          return new Uint8Array(await res.arrayBuffer());
        }
        const rel = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/, "");
        const file = path.resolve(WEB_PUBLIC_DIR, rel);
        if (!file.startsWith(WEB_PUBLIC_DIR + path.sep)) return null; // no escaping the public dir
        return new Uint8Array(await readFile(file));
      } catch {
        return null;
      }
    })();
    imageCache.set(url, hit);
    // Retry failed remote loads later rather than caching the failure forever.
    void hit.then((b) => { if (!b && isAbsoluteUrl(url)) setTimeout(() => imageCache.delete(url), 60_000).unref?.(); });
  }
  return hit;
}

/** Embeds a PNG or JPEG into the document, or returns null (unsupported format / missing file). */
export async function embedBrandImage(doc: PDFDocument, url: string | undefined): Promise<PDFImage | null> {
  const bytes = await loadBrandImage(url);
  if (!bytes || bytes.length < 4) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch {
    /* corrupt image: fall back to text */
  }
  return null;
}

// ───────── Fonts ─────────

/** OFL fonts bundled in apps/api/assets/fonts (licences next to them). */
const FONT_FILES = {
  sans: "Figtree-Regular.ttf",
  sansSemi: "Figtree-SemiBold.ttf",
  sansBold: "Figtree-Bold.ttf",
  serif: "PlayfairDisplay-Regular.ttf",
  script: "GreatVibes-Regular.ttf",
} as const;
type FontKey = keyof typeof FONT_FILES;

const FALLBACK: Record<FontKey, StandardFonts> = {
  sans: StandardFonts.Helvetica,
  sansSemi: StandardFonts.HelveticaBold,
  sansBold: StandardFonts.HelveticaBold,
  serif: StandardFonts.TimesRoman,
  script: StandardFonts.TimesRomanBoldItalic,
};

interface LoadedFont { bytes: Uint8Array; glyphs: { hasGlyphForCodePoint(cp: number): boolean } }
const fontCache = new Map<FontKey, Promise<LoadedFont | null>>();

function loadFont(key: FontKey): Promise<LoadedFont | null> {
  let hit = fontCache.get(key);
  if (!hit) {
    hit = readFile(path.join(FONTS_DIR, FONT_FILES[key]))
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        return { bytes, glyphs: fontkit.create(bytes) as unknown as LoadedFont["glyphs"] };
      })
      .catch(() => null);
    fontCache.set(key, hit);
  }
  return hit;
}

/** A font plus a WinAnsi standard-font fallback for text the bundled font can't draw (e.g. non-Latin names). */
export interface PdfFont {
  font: PDFFont;
  fallback: PDFFont;
  /** Picks the font that can draw the text and returns the text to draw with it. */
  pick(text: string): { font: PDFFont; text: string };
  width(text: string, size: number): number;
}

export function winAnsi(text: string): string {
  return text.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/₹/g, "INR ").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export type PdfFonts = Record<FontKey, PdfFont>;

/** Embeds the bundled brand-neutral fonts (subset) into a document. */
export async function embedFonts(doc: PDFDocument): Promise<PdfFonts> {
  doc.registerFontkit(fontkit);
  const out = {} as PdfFonts;
  for (const key of Object.keys(FONT_FILES) as FontKey[]) {
    const fallback = await doc.embedFont(FALLBACK[key]);
    const loaded = await loadFont(key);
    let font = fallback;
    if (loaded) {
      try {
        font = await doc.embedFont(loaded.bytes, { subset: true });
      } catch {
        font = fallback;
      }
    }
    const custom = font !== fallback && loaded;
    const pick = (text: string) => {
      if (custom && [...text].every((ch) => ch === " " || loaded.glyphs.hasGlyphForCodePoint(ch.codePointAt(0)!))) return { font, text };
      return { font: fallback, text: winAnsi(text) };
    };
    out[key] = {
      font,
      fallback,
      pick,
      width: (text, size) => {
        const p = pick(text);
        return p.font.widthOfTextAtSize(p.text, size);
      },
    };
  }
  return out;
}

// ───────── Colours ─────────

export function hexToRgb(hex: string | undefined, fallback: RGB = rgb(0.1, 0.1, 0.3)): RGB {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((hex ?? "").trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Mixes a colour with white (amount > 0) or black (amount < 0). */
export function shade(c: RGB, amount: number): RGB {
  const t = amount >= 0 ? 1 : 0;
  const a = Math.abs(amount);
  return rgb(c.red + (t - c.red) * a, c.green + (t - c.green) * a, c.blue + (t - c.blue) * a);
}

/** Horizontal two-colour gradient bar (drawn as thin vertical slices). */
export function drawGradientBar(
  page: { drawRectangle(o: { x: number; y: number; width: number; height: number; color: RGB }): void },
  x: number, y: number, width: number, height: number, from: RGB, to: RGB, steps = 80,
): void {
  const w = width / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = rgb(from.red + (to.red - from.red) * t, from.green + (to.green - from.green) * t, from.blue + (to.blue - from.blue) * t);
    page.drawRectangle({ x: x + i * w, y, width: w + 0.5, height, color });
  }
}

/** SVG path for a rounded rectangle, for page.drawSvgPath at origin (0,0) — y is measured downwards. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const top = -(y + h);
  const bottom = -y;
  r = Math.min(r, h / 2, w / 2);
  return `M ${x + r} ${top} L ${x + w - r} ${top} Q ${x + w} ${top} ${x + w} ${top + r} L ${x + w} ${bottom - r} Q ${x + w} ${bottom} ${x + w - r} ${bottom} L ${x + r} ${bottom} Q ${x} ${bottom} ${x} ${bottom - r} L ${x} ${top + r} Q ${x} ${top} ${x + r} ${top} Z`;
}
