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
  };
  logoUrl?: string;
  faviconUrl?: string;
  font?: string;
  radius?: number;
}

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

export function resolveTheme(theme?: Partial<BrandTheme> | null, fallbackPrimary?: string): BrandTheme {
  const base: BrandTheme = fallbackPrimary
    ? { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, primary: fallbackPrimary } }
    : DEFAULT_THEME;
  return {
    ...base,
    ...(theme ?? {}),
    colors: { ...base.colors, ...(theme?.colors ?? {}) },
  };
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
