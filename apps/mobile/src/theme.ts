// Copied from packages/shared (kept local so Metro doesn't need workspace resolution).
export interface BrandTheme {
  colors: {
    primary: string;
    primaryFg: string;
    accent: string;
    bg: string;
    fg: string;
    muted: string;
    card: string;
    border: string;
    /** Call-to-action buttons (Register, Pay) — e.g. Alta green */
    secondary: string;
    secondaryFg: string;
    /** Small highlights and badges — e.g. Alta yellow */
    highlight: string;
    /** Headers and hero banners — e.g. Alta navy */
    heroBg: string;
    heroFg: string;
  };
  logoUrl?: string;
  logoDarkUrl?: string;
  iconUrl?: string;
  faviconUrl?: string;
  font?: string;
  headingFont?: string;
  radius?: number;
  gradient?: [string, string];
  tagline?: string;
}

export type ThemeInput = Partial<Omit<BrandTheme, "colors">> & { colors?: Partial<BrandTheme["colors"]> };

export const DEFAULT_THEME: BrandTheme = {
  colors: {
    primary: "#4f46e5",
    primaryFg: "#ffffff",
    accent: "#f59e0b",
    bg: "#f8fafc",
    fg: "#0f172a",
    muted: "#64748b",
    card: "#ffffff",
    border: "#e2e8f0",
    secondary: "#0ea5e9",
    secondaryFg: "#ffffff",
    highlight: "#f59e0b",
    heroBg: "#1e1b4b",
    heroFg: "#ffffff",
  },
  font: "Inter",
  radius: 12,
};

export const STATUS_COLORS = {
  success: "#16a34a",
  successBg: "#dcfce7",
  warning: "#d97706",
  warningBg: "#fef3c7",
  danger: "#dc2626",
  dangerBg: "#fee2e2",
};

/**
 * Same rules as packages/shared resolveTheme: brands that only set the original 8 colours get derived
 * secondary/highlight/hero colours. `fallback` (the app's brand JSON theme) applies until /v1/tenant loads,
 * and fills anything the tenant theme leaves out.
 */
export function resolveTheme(theme?: ThemeInput | null, fallback?: ThemeInput | null): BrandTheme {
  const merged: ThemeInput = { ...(fallback ?? {}), ...(theme ?? {}), colors: { ...(fallback?.colors ?? {}), ...(theme?.colors ?? {}) } };
  const c = merged.colors ?? {};
  const primary = c.primary ?? DEFAULT_THEME.colors.primary;
  const colors = {
    ...DEFAULT_THEME.colors,
    secondary: c.accent ?? DEFAULT_THEME.colors.secondary,
    highlight: c.accent ?? DEFAULT_THEME.colors.highlight,
    heroBg: primary,
    heroFg: c.primaryFg ?? DEFAULT_THEME.colors.heroFg,
    ...c,
  } as BrandTheme["colors"];
  return {
    ...DEFAULT_THEME,
    ...merged,
    colors,
    headingFont: merged.headingFont ?? merged.font ?? DEFAULT_THEME.font,
    logoDarkUrl: merged.logoDarkUrl ?? merged.logoUrl,
    gradient: merged.gradient ?? [colors.primary, colors.accent],
  };
}

/** True when white text reads better than dark text on this colour. */
export function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
}

/** Adds alpha to a #rrggbb colour. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h}${a}`;
}
