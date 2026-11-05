import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Tenant } from "@prisma/client";
import { prisma } from "./prisma";
import { notFound } from "../lib/errors";

declare module "fastify" {
  interface FastifyRequest {
    tenant: Tenant | null;
  }
}

/**
 * Resolves the brand (tenant) for each request, in order:
 *   1. `X-Tenant: <slug>` header (mobile apps, server-side web calls)
 *   2. `X-Forwarded-Host` / `Host` matched against TenantDomain.hostname
 *   3. `<slug>.localhost` in development
 * Lookups are cached in memory for a short TTL.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { tenant: Tenant | null; expires: number }>();

async function cached(key: string, load: () => Promise<Tenant | null>): Promise<Tenant | null> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.tenant;
  const tenant = await load();
  cache.set(key, { tenant, expires: Date.now() + TTL_MS });
  return tenant;
}

/** Call after changing tenants/domains/themes so other requests see it quickly. */
export function clearTenantCache() {
  cache.clear();
}

function hostOf(req: FastifyRequest): string | null {
  const raw = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
  if (!raw) return null;
  return raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

export async function resolveTenant(req: FastifyRequest): Promise<Tenant | null> {
  const slug = (req.headers["x-tenant"] as string | undefined)?.trim().toLowerCase();
  if (slug) {
    return cached(`slug:${slug}`, () => prisma.tenant.findUnique({ where: { slug } }));
  }
  const host = hostOf(req);
  if (!host) return null;
  return cached(`host:${host}`, async () => {
    const domain = await prisma.tenantDomain.findUnique({ where: { hostname: host }, include: { tenant: true } });
    if (domain) return domain.tenant;
    if (host.endsWith(".localhost")) {
      return prisma.tenant.findUnique({ where: { slug: host.slice(0, -".localhost".length) } });
    }
    return null;
  });
}

export async function tenantPlugin(app: FastifyInstance) {
  app.decorateRequest("tenant", null);
  app.addHook("onRequest", async (req) => {
    req.tenant = await resolveTenant(req);
  });
}

export function requireTenant(req: FastifyRequest): Tenant {
  if (!req.tenant) throw notFound("Brand (tenant) for this domain");
  return req.tenant;
}
