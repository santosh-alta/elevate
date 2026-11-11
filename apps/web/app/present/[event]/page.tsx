import type { Metadata } from "next";
import { BrandRoot } from "@/components/brand-root";
import { requireUser } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { Presenter } from "./presenter";

export const metadata: Metadata = { title: "Check-in screen", robots: { index: false } };

/** Full-screen self check-in QR for the projector or a tablet at the door (no site header). */
export default async function PresentPage({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  await requireUser(`/present/${event}`);
  const tenant = await requireTenant();
  return (
    <BrandRoot tenant={tenant}>
      <Presenter event={event} tenant={{ name: tenant.name, theme: tenant.theme }} />
    </BrandRoot>
  );
}
