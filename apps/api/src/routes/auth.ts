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

/** Accepts a username or a full profile link and returns a full link. */
function profileUrl(v: string | null | undefined, base: string, host: RegExp): string | null | undefined {
  if (!v) return v;
  if (host.test(v)) return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  return base + v.replace(/^@/, "").replace(/\/+$/, "");
}

export function authRoutes(app: FastifyInstance) {
  app.get("/tenant", async (req) => {
    const tenant = requireTenant(req);
    const campuses = await prisma.campus.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, city: true, photoUrl: true },
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

  /** Which "Continue with …" buttons to show. Only public client ids; secrets stay on the API. */
  app.get("/auth/providers", async () => ({
    google: process.env.GOOGLE_CLIENT_ID || null,
    github: process.env.GITHUB_CLIENT_ID || null,
  }));

  /**
   * Finds the user for a social login: by the provider's account id, else by verified email (links the accounts),
   * else creates them. New people join this brand as users.
   */
  async function socialUser(
    tenant: Tenant,
    p: { field: "googleSub" | "githubId"; id: string; email: string; name?: string | null; avatarUrl?: string | null; githubUrl?: string | null },
  ): Promise<User> {
    const email = p.email.toLowerCase();
    const byId = p.field === "googleSub"
      ? await prisma.user.findUnique({ where: { googleSub: p.id } })
      : await prisma.user.findUnique({ where: { githubId: p.id } });
    let user = byId ?? (await prisma.user.findUnique({ where: { email } }));
    if (user) {
      const fill = {
        ...(!user[p.field] && { [p.field]: p.id }),
        ...(!user.avatarUrl && p.avatarUrl && { avatarUrl: p.avatarUrl }),
        ...(!user.githubUrl && p.githubUrl && { githubUrl: p.githubUrl }),
      };
      if (Object.keys(fill).length) user = await prisma.user.update({ where: { id: user.id }, data: fill });
    } else {
      user = await prisma.user.create({
        data: { email, name: p.name?.trim() || email.split("@")[0], [p.field]: p.id, avatarUrl: p.avatarUrl ?? null, githubUrl: p.githubUrl ?? null },
      });
    }
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: "STUDENT" },
      update: {},
    });
    return user;
  }

  const codeBody = z.object({ code: z.string().min(10), redirectUri: z.string().url() });

  /**
   * Google sign-in (OAuth authorization-code flow). The website sends the code Google gave it plus the exact
   * redirect URI it used; the API exchanges it with Google and reads the verified identity from the ID token.
   */
  app.post("/auth/google", async (req) => {
    const tenant = requireTenant(req);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw badRequest("Google sign-in isn't set up yet");
    const body = codeBody.parse(req.body);

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
    const user = await socialUser(tenant, { field: "googleSub", id: claims.sub, email: claims.email, name: claims.name, avatarUrl: claims.picture });
    return signIn(user, tenant);
  });

  /** GitHub sign-in (OAuth App). Uses the account's primary verified email. */
  app.post("/auth/github", async (req) => {
    const tenant = requireTenant(req);
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw badRequest("GitHub sign-in isn't set up yet");
    const body = codeBody.parse(req.body);

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: body.code, redirect_uri: body.redirectUri }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokens = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      req.log.warn({ status: tokenRes.status, error: tokens.error }, "GitHub token exchange failed");
      throw badRequest("GitHub sign-in failed. Please try again.");
    }
    const gh = (path: string) =>
      fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "Elevate" },
        signal: AbortSignal.timeout(10_000),
      }).then((r) => (r.ok ? r.json() : null));
    const [profile, emails] = (await Promise.all([gh("/user"), gh("/user/emails")])) as [
      { id?: number; login?: string; name?: string | null; avatar_url?: string; html_url?: string } | null,
      { email: string; primary: boolean; verified: boolean }[] | null,
    ];
    if (!profile?.id) throw badRequest("GitHub sign-in failed. Please try again.");
    const email = emails?.find((e) => e.primary && e.verified)?.email ?? emails?.find((e) => e.verified)?.email;
    if (!email) throw badRequest("Your GitHub account needs a verified email address");
    const user = await socialUser(tenant, {
      field: "githubId", id: String(profile.id), email, name: profile.name || profile.login, avatarUrl: profile.avatar_url, githubUrl: profile.html_url,
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
    const year = new Date().getFullYear();
    const text = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v === "" ? null : v));
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        phone: z
          .string()
          .trim()
          .transform((v) => v.replace(/[\s()-]/g, ""))
          .refine((v) => v === "" || /^\+?\d{10,15}$/.test(v), "Enter a valid mobile number")
          .transform((v) => (v === "" ? null : /^\d{10}$/.test(v) ? `+91${v}` : v.startsWith("+") ? v : `+${v}`))
          .nullable()
          .optional(),
        avatarUrl: z.string().url().max(1000).nullable().optional(),
        college: text(160),
        degree: text(120),
        city: text(80),
        graduationYear: z.coerce.number().int().min(1950).max(year + 8).nullable().optional(),
        linkedinUrl: text(200).transform((v) => profileUrl(v, "https://www.linkedin.com/in/", /linkedin\.com\//i)),
        githubUrl: text(200).transform((v) => profileUrl(v, "https://github.com/", /github\.com\//i)),
        portfolioUrl: text(200).transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v)),
        /** Sent by the one-time profile page: marks the profile as done. */
        completeProfile: z.boolean().optional(),
      })
      .parse(req.body);
    const { completeProfile, ...data } = body;
    if (completeProfile) {
      const next = { ...user, ...data };
      if (!next.name || next.name === user.email.split("@")[0]) throw badRequest("Please enter your full name");
      if (!next.phone) throw badRequest("Please enter your mobile number");
      if (!next.college) throw badRequest("Please enter your college or organisation");
    }
    return prisma.user.update({
      where: { id: user.id },
      data: { ...data, ...(completeProfile && !user.profileCompletedAt && { profileCompletedAt: new Date() }) },
    });
  });
}
