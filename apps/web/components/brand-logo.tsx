import { resolveTheme } from "@elevate/shared";
import type { Tenant } from "@/lib/types";

export function BrandLogo({ tenant, size = 32 }: { tenant: Tenant; size?: number }) {
  const theme = resolveTheme(tenant.theme);
  if (theme.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={theme.logoUrl} alt={tenant.name} style={{ height: size }} className="w-auto" />;
  }
  return (
    <span
      className="flex items-center justify-center rounded-lg bg-primary font-bold text-primary-fg"
      style={{ height: size, width: size, fontSize: size * 0.45 }}
    >
      {tenant.name.slice(0, 1)}
    </span>
  );
}
