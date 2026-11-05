import type { Tenant } from "@prisma/client";
import { resolveTheme, type BrandTheme } from "@elevate/shared";
import { prisma } from "../plugins/prisma";

export interface BrandSettings {
  hashtags?: string[];
  linkedinOrgUrl?: string;
  /** LinkedIn organization id, used for "Add to profile" certificate links */
  linkedinOrgId?: string;
  emailFrom?: string;
  supportEmail?: string;
  social?: Record<string, string>;
}

export function themeOf(tenant: Tenant): BrandTheme {
  return resolveTheme((tenant.theme ?? {}) as Partial<BrandTheme>);
}

export function settingsOf(tenant: Tenant): BrandSettings {
  return (tenant.settings ?? {}) as BrandSettings;
}

/** Public base URL of a brand's web app: primary verified domain, else first domain, else localhost. */
export async function brandBaseUrl(tenantId: string): Promise<string> {
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  const domain = domains.find((d) => d.verifiedAt) ?? domains[0];
  if (!domain) return process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
  return domain.hostname.endsWith(".localhost") ? `http://${domain.hostname}:3000` : `https://${domain.hostname}`;
}

export function verifyUrl(baseUrl: string, serial: string): string {
  return `${baseUrl}/verify/${serial}`;
}
