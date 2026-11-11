import type { Metadata, Viewport } from "next";
import { resolveTheme } from "@elevate/shared";
import { absoluteUrl } from "./theme";
import type { Tenant } from "./types";

/** Page title, icons and share previews for a brand's site. */
export function brandMetadata(tenant: Tenant | null, origin: string): Metadata {
  if (!tenant) return { title: "Events" };
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

export function brandViewport(tenant: Tenant | null): Viewport {
  return { themeColor: resolveTheme(tenant?.theme).colors.heroBg };
}

/** https://host for a host name (http for local development). */
export function originFor(host: string): string {
  return `${/^(localhost|127\.|[a-z0-9-]+\.localhost)/.test(host) ? "http" : "https"}://${host}`;
}
