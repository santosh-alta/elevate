import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const raw = (name: string, alpha = 1) => `rgb(var(--${name}) / ${alpha})`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v("primary"), fg: v("primary-fg") },
        accent: v("accent"),
        secondary: { DEFAULT: v("secondary"), fg: v("secondary-fg") },
        highlight: { DEFAULT: v("highlight"), fg: v("highlight-fg") },
        hero: { bg: v("hero-bg"), fg: v("hero-fg"), accent: v("hero-accent") },
        bg: v("bg"),
        fg: v("fg"),
        muted: v("muted"),
        card: v("card"),
        border: v("border"),
      },
      borderRadius: {
        brand: "var(--radius)",
      },
      boxShadow: {
        // Layered, soft shadows (shadcn-style) instead of a single hard drop shadow.
        soft: "0 1px 2px rgb(15 23 42 / 0.04), 0 2px 8px -2px rgb(15 23 42 / 0.06)",
        lift: "0 2px 4px rgb(15 23 42 / 0.04), 0 12px 32px -8px rgb(15 23 42 / 0.18)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.35), 0 12px 40px -12px rgb(var(--accent) / 0.45)",
      },
      keyframes: {
        aurora: { "0%,100%": { transform: "translate(0,0) scale(1)" }, "33%": { transform: "translate(6%,-8%) scale(1.08)" }, "66%": { transform: "translate(-5%,6%) scale(0.95)" } },
        shimmer: { "0%": { backgroundPosition: "0% 50%" }, "100%": { backgroundPosition: "200% 50%" } },
        sheen: { "0%": { transform: "translateX(-120%) skewX(-20deg)" }, "100%": { transform: "translateX(220%) skewX(-20deg)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(14px)" }, "100%": { opacity: "1", transform: "none" } },
        "pulse-dot": { "0%": { boxShadow: "0 0 0 0 rgb(var(--hero-accent) / 0.6)" }, "70%": { boxShadow: "0 0 0 8px rgb(var(--hero-accent) / 0)" }, "100%": { boxShadow: "0 0 0 0 rgb(var(--hero-accent) / 0)" } },
      },
      animation: {
        aurora: "aurora 18s ease-in-out infinite",
        "aurora-slow": "aurora 26s ease-in-out infinite reverse",
        shimmer: "shimmer 6s linear infinite",
        float: "float 4s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        "fade-up": "fade-up 0.7s cubic-bezier(0.2,0.7,0.2,1) both",
        "pulse-dot": "pulse-dot 2s ease-out infinite",
      },
      fontFamily: {
        sans: ["var(--font-brand)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-brand)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(90deg, rgb(var(--gradient-from)), rgb(var(--gradient-to)))",
        "brand-gradient-diagonal": "linear-gradient(135deg, rgb(var(--gradient-from)), rgb(var(--gradient-to)))",
      },
      typography: {
        brand: {
          css: {
            "--tw-prose-body": raw("fg", 0.9),
            "--tw-prose-headings": raw("fg"),
            "--tw-prose-lead": raw("muted"),
            "--tw-prose-links": raw("primary"),
            "--tw-prose-bold": raw("fg"),
            "--tw-prose-counters": raw("muted"),
            "--tw-prose-bullets": raw("primary", 0.6),
            "--tw-prose-hr": raw("border"),
            "--tw-prose-quotes": raw("fg"),
            "--tw-prose-quote-borders": raw("primary", 0.5),
            "--tw-prose-captions": raw("muted"),
            "--tw-prose-code": raw("fg"),
            "--tw-prose-pre-code": "#e2e8f0",
            "--tw-prose-pre-bg": "#0f172a",
            "--tw-prose-th-borders": raw("border"),
            "--tw-prose-td-borders": raw("border"),
          },
        },
        DEFAULT: {
          css: {
            maxWidth: "none",
            a: { textDecoration: "underline", textDecorationColor: raw("accent"), textDecorationThickness: "2px", textUnderlineOffset: "3px", fontWeight: "500" },
            "h1, h2, h3, h4": { fontFamily: "var(--font-heading), var(--font-brand), ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.015em" },
            "code::before": { content: "none" },
            "code::after": { content: "none" },
            code: { backgroundColor: raw("fg", 0.06), borderRadius: "4px", padding: "0.1em 0.35em", fontWeight: "500" },
            "pre code": { backgroundColor: "transparent", padding: "0" },
            img: { borderRadius: "var(--radius)" },
            table: { display: "block", overflowX: "auto" },
            "th, td": { border: `1px solid ${raw("border")}`, padding: "0.4em 0.6em" },
            th: { backgroundColor: raw("fg", 0.04) },
          },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
