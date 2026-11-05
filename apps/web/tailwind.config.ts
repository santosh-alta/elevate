import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

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
    },
  },
  plugins: [],
} satisfies Config;
