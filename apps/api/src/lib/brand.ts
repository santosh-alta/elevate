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
  /** Public website shown in email footers, e.g. "https://altaschool.tech" */
  website?: string;
  phone?: string;
  /** Profile URLs by network: instagram, facebook, linkedin, x, youtube */
  social?: Record<string, string>;
  /** Default certificate signatories (a CertificateTemplate's design.signatories wins) */
  signatories?: Signatory[];
}

export interface Signatory {
  name?: string;
  title?: string;
  /** PNG/JPEG signature image (site-relative or absolute) */
  signatureUrl?: string;
}

export function themeOf(tenant: Tenant): BrandTheme {
  return resolveTheme((tenant.theme ?? {}) as Partial<BrandTheme>);
}

export function settingsOf(tenant: Tenant): BrandSettings {
  return (tenant.settings ?? {}) as BrandSettings;
}

/**
 * Public base URL of a brand's web app:
 * primary verified custom domain → WEB_PUBLIC_URL → first configured domain → localhost.
 */
export async function brandBaseUrl(tenantId: string): Promise<string> {
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  const verified = domains.find((d) => d.verifiedAt && !d.hostname.endsWith(".localhost"));
  if (verified) return `https://${verified.hostname}`;
  if (process.env.WEB_PUBLIC_URL) return process.env.WEB_PUBLIC_URL.replace(/\/$/, "");
  const domain = domains[0];
  if (!domain) return "http://localhost:3000";
  return domain.hostname.endsWith(".localhost") ? `http://${domain.hostname}:3000` : `https://${domain.hostname}`;
}

export function apiBaseUrl(): string {
  return (process.env.API_PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export async function eventPageUrl(event: { tenantId: string; slug: string }): Promise<string> {
  return `${await brandBaseUrl(event.tenantId)}/events/${event.slug}`;
}

export function verifyUrl(baseUrl: string, serial: string): string {
  return `${baseUrl}/verify/${serial}`;
}
