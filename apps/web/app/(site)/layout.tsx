import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ScrollEffects } from "@/components/client/motion";
import { BrandRoot } from "@/components/brand-root";
import { BrandNotFound } from "@/components/brand-not-found";
import { brandMetadata, brandViewport } from "@/lib/brand-meta";
import { getHost, getOrigin, getTenant } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getOrigin()]);
  return brandMetadata(tenant, origin);
}

export async function generateViewport(): Promise<Viewport> {
  return brandViewport(await getTenant());
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenant();
  if (!tenant) return <BrandRoot tenant={null}><BrandNotFound host={await getHost()} /></BrandRoot>;
  return (
    <BrandRoot tenant={tenant}>
      <SiteHeader tenant={tenant} />
      <main>{children}</main>
      <SiteFooter tenant={tenant} />
      <ScrollEffects />
    </BrandRoot>
  );
}
