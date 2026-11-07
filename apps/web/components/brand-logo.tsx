import { resolveTheme } from "@elevate/shared";
import type { Tenant } from "@/lib/types";
import { cn } from "./ui/cn";

const SIZES = { sm: 28, md: 36, lg: 48, xl: 64 } as const;
export type LogoSize = keyof typeof SIZES | number;

/**
 * Brand logo from the theme.
 * - variant "light" (default): for light backgrounds, uses theme.logoUrl
 * - variant "dark": for dark/hero backgrounds, uses theme.logoDarkUrl (falls back to logoUrl)
 * - mark: square icon only (theme.iconUrl), e.g. collapsed sidebars
 * Without an image it renders the brand initial (and the name when `showName`).
 */
export function BrandLogo({
  tenant, size = "md", variant = "light", mark = false, showName = false, className,
}: {
  tenant: Pick<Tenant, "name" | "theme">; size?: LogoSize; variant?: "light" | "dark"; mark?: boolean; showName?: boolean; className?: string;
}) {
  const theme = resolveTheme(tenant.theme);
  const h = typeof size === "number" ? size : SIZES[size];
  const src = mark ? theme.iconUrl : variant === "dark" ? theme.logoDarkUrl ?? theme.logoUrl : theme.logoUrl;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={tenant.name} style={{ height: h }} className={cn("w-auto max-w-none shrink-0 object-contain", className)} />;
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden={showName}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg font-heading font-bold",
          variant === "dark" ? "bg-hero-fg/15 text-hero-fg ring-1 ring-inset ring-hero-fg/25" : "bg-primary text-primary-fg",
        )}
        style={{ height: h, width: h, fontSize: h * 0.45 }}
        title={showName ? undefined : tenant.name}
      >
        {tenant.name.slice(0, 1)}
      </span>
      {showName && <span className={cn("font-heading font-bold tracking-tight", variant === "dark" ? "text-hero-fg" : "text-fg")} style={{ fontSize: Math.max(14, h * 0.45) }}>{tenant.name}</span>}
    </span>
  );
}
