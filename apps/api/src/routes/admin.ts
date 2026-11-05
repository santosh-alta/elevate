import type { FastifyInstance } from "fastify";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { ROLES } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { clearTenantCache, requireTenant } from "../plugins/tenant";
import { requireBrandAdmin, requirePlatformAdmin } from "../lib/permissions";
import { badRequest, notFound } from "../lib/errors";
import { themeOf } from "../lib/brand";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f46e5");
const themeSchema = z.object({
  colors: z
    .object({ primary: hex, primaryFg: hex, accent: hex, bg: hex, fg: hex, muted: hex, card: hex, border: hex })
    .partial()
    .optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  font: z.string().max(60).optional(),
  radius: z.number().int().min(0).max(32).optional(),
});

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a domain like event.yourbrand.com");

function cnameTarget() {
  return process.env.CNAME_TARGET ?? "domains.elevate.app";
}

function domainView(d: { id: string; hostname: string; isPrimary: boolean; verificationToken: string; verifiedAt: Date | null; createdAt: Date }) {
  return {
    ...d,
    cnameTarget: cnameTarget(),
    dns: [
      { type: "CNAME", name: d.hostname, value: cnameTarget() },
      { type: "TXT", name: `_elevate.${d.hostname}`, value: d.verificationToken },
    ],
  };
}

export function adminRoutes(app: FastifyInstance) {
  // ───────── Campuses ─────────
  app.get("/admin/campuses", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    return prisma.campus.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: true, events: true } } },
    });
  });

  app.post("/admin/campuses", async (req, reply) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const body = z
      .object({ name: z.string().min(2), code: z.string().min(2).max(12).toUpperCase(), city: z.string().optional(), address: z.string().optional() })
      .parse(req.body);
    const campus = await prisma.campus.create({ data: { ...body, tenantId: tenant.id } });
    return reply.status(201).send(campus);
  });

  app.patch<{ Params: { campusId: string } }>("/admin/campuses/:campusId", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const campus = await prisma.campus.findFirst({ where: { id: req.params.campusId, tenantId: tenant.id } });
    if (!campus) throw notFound("Campus");
    const body = z.object({ name: z.string().min(2).optional(), city: z.string().optional(), address: z.string().optional() }).parse(req.body);
    return prisma.campus.update({ where: { id: campus.id }, data: body });
  });

  // ───────── Members ─────────
  app.get("/admin/members", async (req, reply) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const q = z
      .object({
        role: z.enum(ROLES).optional(),
        campusId: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const where = {
      tenantId: tenant.id,
      ...(q.role && { role: q.role }),
      ...(q.campusId && { campusId: q.campusId }),
      ...(q.search && {
        user: { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { email: { contains: q.search, mode: "insensitive" as const } }] },
      }),
    };
    const [items, total] = await Promise.all([
      prisma.membership.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } }, campus: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.membership.count({ where }),
    ]);
    reply.header("X-Total-Count", String(total));
    return items;
  });

  app.post("/admin/members", async (req, reply) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(ROLES),
        campusId: z.string().optional(),
        batch: z.string().optional(),
        rollNo: z.string().optional(),
      })
      .parse(req.body);
    if (body.campusId && !(await prisma.campus.findFirst({ where: { id: body.campusId, tenantId: tenant.id } }))) {
      throw badRequest("Unknown campus");
    }
    if (body.role === "CAMPUS_ADMIN" && !body.campusId) throw badRequest("Campus admins need a campus");
    const email = body.email.toLowerCase();
    const user =
      (await prisma.user.findUnique({ where: { email } })) ?? (await prisma.user.create({ data: { email, name: body.name } }));
    const m = await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: body.role, campusId: body.campusId, batch: body.batch, rollNo: body.rollNo },
      update: { role: body.role, campusId: body.campusId, batch: body.batch, rollNo: body.rollNo },
      include: { user: true, campus: true },
    });
    return reply.status(201).send(m);
  });

  app.patch<{ Params: { membershipId: string } }>("/admin/members/:membershipId", async (req) => {
    const auth = requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const m = await prisma.membership.findFirst({ where: { id: req.params.membershipId, tenantId: tenant.id } });
    if (!m) throw notFound("Member");
    const body = z
      .object({ role: z.enum(ROLES).optional(), campusId: z.string().nullable().optional(), batch: z.string().optional(), rollNo: z.string().optional() })
      .parse(req.body);
    if (m.userId === auth.user.id && body.role && body.role !== "BRAND_ADMIN" && !auth.user.isPlatformAdmin) {
      throw badRequest("You can't remove your own admin role");
    }
    return prisma.membership.update({ where: { id: m.id }, data: body });
  });

  // ───────── Theme ─────────
  app.patch("/admin/theme", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const { theme, name, settings } = z
      .object({
        theme: themeSchema.optional(),
        name: z.string().min(2).optional(),
        settings: z
          .object({
            hashtags: z.array(z.string()).optional(),
            linkedinOrgUrl: z.string().url().optional(),
            linkedinOrgId: z.string().optional(),
            emailFrom: z.string().email().optional(),
            supportEmail: z.string().email().optional(),
            social: z.record(z.string()).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    const current = themeOf(tenant);
    const nextTheme = theme ? { ...current, ...theme, colors: { ...current.colors, ...(theme.colors ?? {}) } } : current;
    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        theme: nextTheme,
        ...(name && { name }),
        ...(settings && { settings: { ...((tenant.settings as object) ?? {}), ...settings } }),
      },
    });
    clearTenantCache();
    return { id: updated.id, slug: updated.slug, name: updated.name, theme: themeOf(updated), settings: updated.settings };
  });

  // ───────── Custom domains ─────────
  app.get("/admin/domains", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const domains = await prisma.tenantDomain.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
    return domains.map(domainView);
  });

  app.post("/admin/domains", async (req, reply) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const { hostname, isPrimary } = z.object({ hostname: hostnameSchema, isPrimary: z.boolean().default(false) }).parse(req.body);
    const taken = await prisma.tenantDomain.findUnique({ where: { hostname } });
    if (taken) throw badRequest("That domain is already connected to a brand");
    const domain = await prisma.tenantDomain.create({ data: { tenantId: tenant.id, hostname, isPrimary } });
    if (isPrimary) await prisma.tenantDomain.updateMany({ where: { tenantId: tenant.id, id: { not: domain.id } }, data: { isPrimary: false } });
    return reply.status(201).send(domainView(domain));
  });

  /** Checks for a TXT record `_elevate.<hostname>` = verificationToken. */
  app.post<{ Params: { domainId: string } }>("/admin/domains/:domainId/verify", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const domain = await prisma.tenantDomain.findFirst({ where: { id: req.params.domainId, tenantId: tenant.id } });
    if (!domain) throw notFound("Domain");
    let records: string[] = [];
    try {
      records = (await resolveTxt(`_elevate.${domain.hostname}`)).map((parts) => parts.join(""));
    } catch {
      records = [];
    }
    const ok = records.includes(domain.verificationToken);
    const updated = ok
      ? await prisma.tenantDomain.update({ where: { id: domain.id }, data: { verifiedAt: domain.verifiedAt ?? new Date() } })
      : domain;
    if (ok) clearTenantCache();
    // Next step after verification (deployment-specific): add the hostname to the web host
    // (e.g. Vercel Domains API or Caddy on-demand TLS) so SSL is issued automatically.
    return {
      ...domainView(updated),
      verified: ok,
      message: ok ? "Domain verified" : `TXT record _elevate.${domain.hostname} with value ${domain.verificationToken} not found yet. DNS changes can take a while to appear.`,
    };
  });

  app.delete<{ Params: { domainId: string } }>("/admin/domains/:domainId", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const domain = await prisma.tenantDomain.findFirst({ where: { id: req.params.domainId, tenantId: tenant.id } });
    if (!domain) throw notFound("Domain");
    await prisma.tenantDomain.delete({ where: { id: domain.id } });
    clearTenantCache();
    return { ok: true };
  });

  // ───────── Platform (Elevate team) ─────────
  app.get("/platform/tenants", async (req) => {
    requirePlatformAdmin(req);
    const tenants = await prisma.tenant.findMany({
      orderBy: { name: "asc" },
      include: { domains: true, _count: { select: { events: true, memberships: true, campuses: true } } },
    });
    return Promise.all(
      tenants.map(async (t) => {
        const [completed, registrations, certificates] = await Promise.all([
          prisma.event.count({ where: { tenantId: t.id, status: "COMPLETED" } }),
          prisma.registration.count({ where: { event: { tenantId: t.id } } }),
          prisma.certificate.count({ where: { event: { tenantId: t.id }, revokedAt: null } }),
        ]);
        return { ...t, theme: themeOf(t), stats: { completedEvents: completed, registrations, certificates } };
      }),
    );
  });

  app.post("/platform/tenants", async (req, reply) => {
    requirePlatformAdmin(req);
    const body = z
      .object({
        slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
        name: z.string().min(2),
        theme: themeSchema.optional(),
        adminEmail: z.string().email().optional(),
        adminName: z.string().optional(),
      })
      .parse(req.body);
    const tenant = await prisma.tenant.create({
      data: {
        slug: body.slug,
        name: body.name,
        theme: body.theme ?? {},
        domains: { create: [{ hostname: `${body.slug}.localhost`, verifiedAt: new Date() }] },
      },
    });
    if (body.adminEmail) {
      const email = body.adminEmail.toLowerCase();
      const user =
        (await prisma.user.findUnique({ where: { email } })) ??
        (await prisma.user.create({ data: { email, name: body.adminName ?? email.split("@")[0] } }));
      await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "BRAND_ADMIN" } });
    }
    clearTenantCache();
    return reply.status(201).send(tenant);
  });
}
