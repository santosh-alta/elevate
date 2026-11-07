import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { resolveTheme } from "@elevate/shared";
import { getHost, getOrigin, getTenant } from "@/lib/tenant";
import { absoluteUrl, googleFontHrefs, themeCss } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getOrigin()]);
  if (!tenant) return { title: "Elevate" };
  const theme = resolveTheme(tenant.theme);
  const siteName = `${tenant.name} Events`;
  const description = theme.tagline ?? (tenant.settings.tagline as string | undefined) ?? `Events, hackathons, workshops and seminars at ${tenant.name}.`;
  const og = absoluteUrl(theme.ogImageUrl, origin);
  const icon = theme.faviconUrl ?? theme.iconUrl;
  const apple = theme.appleTouchIconUrl ?? theme.iconUrl;
  let metadataBase: URL | undefined;
  try { metadataBase = new URL(origin); } catch { /* unknown host */ }
  return {
    metadataBase,
    title: { default: siteName, template: `%s · ${siteName}` },
    description,
    applicationName: siteName,
    icons: icon || apple ? { icon: icon ? [{ url: icon }] : undefined, apple: apple ? [{ url: apple }] : undefined } : undefined,
    openGraph: { type: "website", siteName, title: siteName, description, images: og ? [{ url: og, width: 1200, height: 630, alt: tenant.name }] : undefined },
    twitter: { card: og ? "summary_large_image" : "summary", title: siteName, description, images: og ? [og] : undefined },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const tenant = await getTenant();
  return { themeColor: resolveTheme(tenant?.theme).colors.heroBg };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenant();
  const theme = resolveTheme(tenant?.theme);
  const fontHrefs = googleFontHrefs(theme);
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(tenant?.theme) }} />
        {theme.fontCssUrl && <link rel="stylesheet" href={theme.fontCssUrl} />}
        {fontHrefs.length > 0 && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            {fontHrefs.map((href) => <link key={href} rel="stylesheet" href={href} />)}
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
