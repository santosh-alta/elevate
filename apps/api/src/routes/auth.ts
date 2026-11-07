import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireUser } from "../lib/permissions";
import { otpCode, sha256 } from "../lib/codes";
import { badRequest } from "../lib/errors";
import { themeOf } from "../lib/brand";
import { sendEmail } from "../lib/mailer";
import { fromAddress, renderEmailHtml } from "../lib/notify";
import type { Tenant, User } from "@prisma/client";

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
      settings: {
        hashtags: s.hashtags ?? [], linkedinOrgUrl: s.linkedinOrgUrl, supportEmail: s.supportEmail, social: s.social ?? {},
        website: s.website, phone: s.phone, address: s.address, signatories: s.signatories ?? [],
      },
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

    // Sent right away (not through the outbox): the person is waiting for it.
    const dev = process.env.NODE_ENV !== "production";
    if (dev) req.log.info({ email, code }, "OTP code (dev only)");
    const subject = `${code} is your ${tenant.name} sign-in code`;
    const text = `Your sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`;
    try {
      const sent = await sendEmail({ from: fromAddress(tenant), to: email, subject, text, html: await renderEmailHtml(tenant, subject, text) });
      if (sent.status === "SKIPPED" && !dev) throw badRequest("Email sign-in isn't available right now. Please continue with Google.");
    } catch (err) {
      if (dev) req.log.warn({ err }, "OTP email failed (dev)");
      else {
        req.log.error({ err }, "OTP email failed");
        throw badRequest("We couldn't send the code. Please try again, or continue with Google.");
      }
    }
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

    return signIn(user, req.tenant);
  });

  /** Signs a user in and returns their membership in this brand. */
  async function signIn(user: User, tenant: Tenant | null) {
    const token = app.jwt.sign({ sub: user.id });
    const membership = tenant
      ? await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } } })
      : null;
    return { token, user, membership };
  }

  /** Whether "Continue with Google" is available (the website asks before showing the button). */
  app.get("/auth/google/config", async () => ({ clientId: process.env.GOOGLE_CLIENT_ID || null }));

  /**
   * Google sign-in (OAuth authorization-code flow). The website sends the code Google gave it plus the exact
   * redirect URI it used; the API exchanges it with Google and reads the verified identity from the ID token.
   */
  app.post("/auth/google", async (req) => {
    const tenant = requireTenant(req);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw badRequest("Google sign-in isn't set up yet");
    const body = z.object({ code: z.string().min(10), redirectUri: z.string().url() }).parse(req.body);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: body.code, client_id: clientId, client_secret: clientSecret, redirect_uri: body.redirectUri, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokens = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!tokenRes.ok || !tokens.id_token) {
      req.log.warn({ status: tokenRes.status, error: tokens.error }, "Google token exchange failed");
      throw badRequest("Google sign-in failed. Please try again.");
    }
    // The ID token came straight from Google over TLS, so its claims can be read without re-verifying the signature.
    const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")) as {
      sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; aud?: string; iss?: string;
    };
    if (claims.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss ?? "")) {
      throw badRequest("Google sign-in failed. Please try again.");
    }
    if (!claims.sub || !claims.email || !claims.email_verified) throw badRequest("Your Google account's email isn't verified");
    const email = claims.email.toLowerCase();

    let user =
      (await prisma.user.findUnique({ where: { googleSub: claims.sub } })) ??
      (await prisma.user.findUnique({ where: { email } }));
    if (user) {
      if (!user.googleSub || (!user.avatarUrl && claims.picture)) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleSub: claims.sub, ...(!user.avatarUrl && claims.picture && { avatarUrl: claims.picture }) },
        });
      }
    } else {
      user = await prisma.user.create({
        data: { email, name: claims.name?.trim() || email.split("@")[0], googleSub: claims.sub, avatarUrl: claims.picture ?? null },
      });
    }
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: "STUDENT" },
      update: {},
    });
    return signIn(user, tenant);
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
