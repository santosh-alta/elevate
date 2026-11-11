import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { NavProgress, ScrollReveal } from "@/components/client/motion";
import { THEME_INIT_SCRIPT } from "@/components/client/theme-toggle";
import "./globals.css";

export const metadata: Metadata = { title: "Events" };

/** Brand-neutral shell. Each area (site, admin, pre-built pages) adds the brand's look in its own layout. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body id="top" className="min-h-screen font-sans antialiased">
        <Suspense fallback={null}><NavProgress /></Suspense>
        <ScrollReveal />
        {children}
      </body>
    </html>
  );
}
