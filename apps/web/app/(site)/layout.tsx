import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ScrollEffects } from "@/components/client/motion";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <ScrollEffects />
    </>
  );
}
