import type { Metadata } from "next";
import type { ReactNode } from "react";
import { resolveTheme } from "@elevate/shared";
import { getHost, getTenant } from "@/lib/tenant";
import { googleFontHref, themeCss } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  if (!tenant) return { title: "Elevate" };
  const theme = resolveTheme(tenant.theme);
  return {
    title: { default: `${tenant.name} Events`, template: `%s · ${tenant.name} Events` },
    description: (tenant.settings.tagline as string) ?? `Events, hackathons, workshops and seminars at ${tenant.name}.`,
    icons: theme.faviconUrl ? { icon: theme.faviconUrl } : undefined,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenant();
  const theme = resolveTheme(tenant?.theme);
  const fontHref = googleFontHref(theme.font);
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(tenant?.theme) }} />
        {fontHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={fontHref} />
          </>
        )}
      </head>
      <body className="min-h-screen font-sans antialiased">
        {tenant ? children : <BrandNotFound host={await getHost()} />}
      </body>
    </html>
  );
}

function BrandNotFound({ host }: { host: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-fg">E</div>
        <h1 className="text-2xl font-semibold">This site isn&apos;t set up yet</h1>
        <p className="mt-3 text-muted">
          We couldn&apos;t find an events site for <span className="font-mono text-fg">{host || "this domain"}</span>, or the
          service is temporarily unavailable. Please check the address or try again in a few minutes.
        </p>
        <p className="mt-6 text-xs text-muted">Powered by Elevate</p>
      </div>
    </main>
  );
}
