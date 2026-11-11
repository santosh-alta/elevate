import type { Metadata, Viewport } from "next";
import { resolveTheme } from "@elevate/shared";
import type { Tenant } from "./types";

/** Page title, icons and share previews for a brand's site. */
export function brandMetadata(tenant: Tenant | null, origin: string): Metadata {
  if (!tenant) return { title: "Events" };
  const theme = resolveTheme(tenant.theme);
  const siteName = `${tenant.name} Events`;
  const description = theme.tagline ?? (tenant.settings.tagline as string | undefined) ?? `Events, hackathons, workshops and seminars at ${tenant.name}.`;
  const og = `${origin}/og/home`;
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
    openGraph: { type: "website", siteName, title: siteName, description, url: origin, images: [{ url: og, width: 1200, height: 630, alt: tenant.name }] },
    twitter: { card: "summary_large_image", title: siteName, description, images: [og] },
  };
}

export function brandViewport(tenant: Tenant | null): Viewport {
  return { themeColor: resolveTheme(tenant?.theme).colors.heroBg };
}

/** https://host for a host name (http for local development). */
export function originFor(host: string): string {
  return `${/^(localhost|127\.|[a-z0-9-]+\.localhost)/.test(host) ? "http" : "https"}://${host}`;
}

/**
 * Share preview for one page: its own title and description, and a branded card drawn by /og/<card>
 * (see app/og/[...key]/route.tsx). `card` is e.g. "events" or "event/<slug>".
 */
export function sharePreview(tenant: Tenant | null, origin: string, card: string, title: string, description?: string, path?: string): Pick<Metadata, "openGraph" | "twitter"> {
  const image = `${origin}/og/${card}`;
  const siteName = tenant ? `${tenant.name} Events` : undefined;
  return {
    openGraph: { type: "website", siteName, title, description, url: path ? `${origin}${path}` : undefined, images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
