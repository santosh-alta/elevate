import { resolveTheme, type BrandTheme } from "@elevate/shared";

/** "#4f46e5" → "79 70 229" (Tailwind needs space-separated channels for /alpha). */
export function hexToRgb(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return "0 0 0";
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const VARS: [keyof BrandTheme["colors"], string][] = [
  ["primary", "--primary"], ["primaryFg", "--primary-fg"], ["accent", "--accent"], ["bg", "--bg"],
  ["fg", "--fg"], ["muted", "--muted"], ["card", "--card"], ["border", "--border"],
];

export function themeCss(partial: Partial<BrandTheme> | null | undefined): string {
  const t = resolveTheme(partial);
  const lines = VARS.map(([k, v]) => `${v}: ${hexToRgb(t.colors[k])};`);
  lines.push(`--radius: ${t.radius ?? 12}px;`);
  lines.push(`--font-brand: "${(t.font ?? "Inter").replace(/"/g, "")}";`);
  return `:root{${lines.join("")}}`;
}

export function googleFontHref(font?: string): string | null {
  if (!font) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
}
