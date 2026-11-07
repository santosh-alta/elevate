import { resolveTheme, type BrandTheme } from "@elevate/shared";

/** Theme as stored on a tenant: every field optional (older brands only set the original 8 colours). */
export type ThemeInput = Parameters<typeof resolveTheme>[0];

/** "#4f46e5" → "79 70 229" (Tailwind needs space-separated channels for /alpha). */
export function hexToRgb(hex: string): string {
  const [r, g, b] = rgbTuple(hex);
  return `${r} ${g} ${b}`;
}

function rgbTuple(hex: string): [number, number, number] {
  let h = (hex ?? "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgbTuple(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Text colour to use on `bg`: the brand's choice when it is readable (≥ 4.5:1),
 * otherwise whichever of the brand text colour / white / near-black reads best.
 */
export function readableOn(bg: string, preferred: string, fg = "#0f172a"): string {
  if (contrast(bg, preferred) >= 4.5) return preferred;
  return [fg, "#ffffff", "#111111"].sort((p, q) => contrast(bg, q) - contrast(bg, p))[0];
}

/** First candidate that reads on `bg` as text (used for the highlighted word in hero headlines). */
export function accentOn(bg: string, candidates: string[], fallback: string): string {
  return candidates.find((c) => contrast(bg, c) >= 4.5) ?? fallback;
}

/** "Proxima Nova, Figtree" → ["Proxima Nova", "Figtree"] */
export function fontFamilies(value?: string): string[] {
  return (value ?? "").split(",").map((f) => f.trim().replace(/["']/g, "")).filter(Boolean);
}

/**
 * Families to fetch from Google Fonts. With a licensed-font stylesheet (fontCssUrl), the first family of
 * each list is assumed to come from that stylesheet (e.g. "Proxima Nova, Figtree"), the rest from Google.
 */
export function googleFamilies(t: BrandTheme): string[] {
  const pick = (v?: string) => {
    const fams = fontFamilies(v);
    return t.fontCssUrl && fams.length > 1 ? fams.slice(1) : fams;
  };
  return [...new Set([...pick(t.font), ...pick(t.headingFont)])];
}

function stack(value: string | undefined, fallback: string): string {
  const fams = fontFamilies(value);
  return (fams.length ? fams : [fallback]).map((f) => `"${f}"`).join(", ");
}

/** Fully resolved theme with the derived, contrast-safe colours the UI uses. */
export function brandColors(partial: ThemeInput) {
  const t = resolveTheme(partial);
  const c = t.colors;
  return {
    theme: t,
    colors: {
      ...c,
      primaryFg: c.primaryFg,
      secondaryFg: readableOn(c.secondary, c.secondaryFg, c.fg),
      heroFg: readableOn(c.heroBg, c.heroFg, c.fg),
      highlightFg: readableOn(c.highlight, c.fg, c.fg),
      heroAccent: accentOn(c.heroBg, [c.secondary, c.highlight, c.accent], readableOn(c.heroBg, c.heroFg, c.fg)),
    },
    gradient: (t.gradient ?? [c.primary, c.accent]) as [string, string],
  };
}

export function themeCss(partial: ThemeInput): string {
  const { theme: t, colors: c, gradient } = brandColors(partial);
  const vars: [string, string][] = [
    ["--primary", c.primary], ["--primary-fg", c.primaryFg], ["--accent", c.accent], ["--bg", c.bg],
    ["--fg", c.fg], ["--muted", c.muted], ["--card", c.card], ["--border", c.border],
    ["--secondary", c.secondary], ["--secondary-fg", c.secondaryFg], ["--highlight", c.highlight], ["--highlight-fg", c.highlightFg],
    ["--hero-bg", c.heroBg], ["--hero-fg", c.heroFg], ["--hero-accent", c.heroAccent],
    ["--gradient-from", gradient[0]], ["--gradient-to", gradient[1]],
  ];
  const lines = vars.map(([k, v]) => `${k}: ${hexToRgb(v)};`);
  lines.push(`--radius: ${t.radius ?? 12}px;`);
  lines.push(`--font-brand: ${stack(t.font, "Inter")};`);
  lines.push(`--font-heading: ${stack(t.headingFont ?? t.font, "Inter")};`);
  return `:root{${lines.join("")}}`;
}

/** One stylesheet per family, so an unknown family can't break the others. */
export function googleFontHrefs(t: BrandTheme): string[] {
  return googleFamilies(t).map(googleFontHref).filter((h): h is string => !!h);
}

export function googleFontHref(font?: string): string | null {
  if (!font) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
}

/** Make a theme asset URL ("/brands/x/og.png" or "https://…") absolute for metadata / social cards. */
export function absoluteUrl(url: string | undefined | null, origin: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, origin).toString();
  } catch {
    return undefined;
  }
}
