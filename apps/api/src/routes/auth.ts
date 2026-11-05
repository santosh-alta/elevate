import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireUser } from "../lib/permissions";
import { otpCode, sha256 } from "../lib/codes";
import { badRequest } from "../lib/errors";
import { themeOf } from "../lib/brand";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_CODES = 5;

export function authRoutes(app: FastifyInstance) {
  app.get("/tenant", async (req) => {
    const tenant = requireTenant(req);
    const campuses = await prisma.campus.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, city: true },
    });
    // Public settings only.
    const s = (tenant.settings ?? {}) as Record<string, unknown>;
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      theme: themeOf(tenant),
      settings: { hashtags: s.hashtags ?? [], linkedinOrgUrl: s.linkedinOrgUrl, supportEmail: s.supportEmail, social: s.social ?? {} },
      campuses,
    };
  });

  app.post("/auth/otp/request", async (req) => {
    const tenant = requireTenant(req);
    const body = z.object({ email: z.string().email(), name: z.string().max(120).optional() }).parse(req.body);
    const email = body.email.toLowerCase().trim();

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email, name: body.name?.trim() || email.split("@")[0] } });
    }
    // New people signing up through a brand become STUDENT members of it.
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: "STUDENT" },
      update: {},
    });

    const recent = await prisma.otpCode.count({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (recent >= MAX_ACTIVE_CODES) throw badRequest("Too many codes requested. Please wait a few minutes.");

    const code = otpCode();
    await prisma.otpCode.create({
      data: { userId: user.id, codeHash: sha256(`${user.id}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    // TODO: send via email provider (brand sender). Until then the code is logged in development.
    const dev = process.env.NODE_ENV !== "production";
    if (dev) req.log.info({ email, code }, "OTP code (dev only)");
    return { ok: true, ...(dev ? { devCode: code } : {}) };
  });

  app.post("/auth/otp/verify", async (req) => {
    const body = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (!user) throw badRequest("Invalid or expired code");

    const otp = await prisma.otpCode.findFirst({
      where: { userId: user.id, codeHash: sha256(`${user.id}:${body.code}`), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!otp) throw badRequest("Invalid or expired code");
    await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    const token = app.jwt.sign({ sub: user.id });
    const membership = req.tenant
      ? await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: req.tenant.id, userId: user.id } } })
      : null;
    return { token, user, membership };
  });

  app.get("/me", async (req) => {
    const { user, membership } = requireUser(req);
    const campus = membership?.campusId ? await prisma.campus.findUnique({ where: { id: membership.campusId } }) : null;
    return { user, membership: membership ? { ...membership, campus } : null };
  });

  app.patch("/me", async (req) => {
    const { user } = requireUser(req);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        avatarUrl: z.string().url().optional(),
        linkedinUrl: z.string().url().optional(),
        githubUrl: z.string().url().optional(),
      })
      .parse(req.body);
    return prisma.user.update({ where: { id: user.id }, data: body });
  });
}
