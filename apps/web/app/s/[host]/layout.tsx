import { SiteTour } from "@/components/client/site-tour";
import { PUBLIC_TOUR_PATHS, publicTour } from "@/lib/tours";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ScrollEffects } from "@/components/client/motion";
import { ChatWidget } from "@/components/client/chat-widget";
import { BrandRoot } from "@/components/brand-root";
import { brandMetadata, brandViewport, originFor } from "@/lib/brand-meta";
import { tenantForHost } from "@/lib/tenant";

/**
 * Pre-built public pages (home, campuses), one copy per brand host, refreshed every minute and served from the
 * edge. Middleware rewrites e.g. event.altaschool.tech/ → /s/event.altaschool.tech, so addresses don't change.
 * Nothing here may read cookies or request headers, or the pages stop being pre-built.
 */
export const revalidate = 60;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { children: ReactNode; params: Promise<{ host: string }> };

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const host = decodeURIComponent((await params).host);
  return brandMetadata(await tenantForHost(host), originFor(host));
}

export async function generateViewport({ params }: { params: Promise<{ host: string }> }): Promise<Viewport> {
  return brandViewport(await tenantForHost(decodeURIComponent((await params).host)));
}

export default async function PrebuiltLayout({ children, params }: Props) {
  const host = decodeURIComponent((await params).host);
  const tenant = await tenantForHost(host);
  if (!tenant) notFound();
  return (
    <BrandRoot tenant={tenant}>
      <SiteHeader tenant={tenant} clientUser />
      <main>{children}</main>
      <SiteFooter tenant={tenant} />
      <ScrollEffects />
      <ChatWidget />
      <SiteTour id="public" autoStartOn={PUBLIC_TOUR_PATHS} steps={publicTour(tenant.name.split(" ")[0])} />
    </BrandRoot>
  );
}
