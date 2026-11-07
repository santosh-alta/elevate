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
        bg: v("bg"),
        fg: v("fg"),
        muted: v("muted"),
        card: v("card"),
        border: v("border"),
      },
      borderRadius: {
        brand: "var(--radius)",
      },
      fontFamily: {
        sans: ["var(--font-brand)", "ui-sans-serif", "system-ui", "sans-serif"],
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
            a: { textDecoration: "underline", textUnderlineOffset: "2px", fontWeight: "500" },
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
