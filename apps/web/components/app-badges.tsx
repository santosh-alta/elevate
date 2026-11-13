import type { Tenant } from "@/lib/types";
import { cn } from "@/components/ui/cn";

/** The brand's Google Play link (Admin → Settings → Contact details), if it has an Android app. */
export function androidAppUrl(tenant: Tenant): string | undefined {
  const url = tenant.settings.androidAppUrl;
  return typeof url === "string" && /^https:\/\/play\.google\.com\//.test(url) ? url : undefined;
}

/** Official "Get it on Google Play" badge linking to the brand's app. Renders nothing when the brand has no app. */
export function PlayBadge({ tenant, className }: { tenant: Tenant; className?: string }) {
  const url = androidAppUrl(tenant);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`Get the ${tenant.name} app on Google Play`}
      className={cn("inline-block rounded-lg transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/badges/google-play.png" alt="Get it on Google Play" width={564} height={168} className="h-12 w-auto" />
    </a>
  );
}
