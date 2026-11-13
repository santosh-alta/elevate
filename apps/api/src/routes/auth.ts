import { timingSafeEqual } from "node:crypto";
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
      select: { id: true, name: true, code: true, city: true, photoUrl: true, details: true },
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
      // Only the display region from each campus profile (e.g. "Delhi NCR"); the rest is on /campuses/:code.
      campuses: campuses.map(({ details, ...c }) => ({ ...c, region: ((details ?? {}) as { region?: string }).region ?? null })),
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
    const email = body.email.toLowerCase().trim();

    // App-store review account (Google Play / App Store reviewers can't receive email). Works only when both
    // REVIEW_LOGIN_EMAIL and REVIEW_LOGIN_CODE are set on the server; the account is an ordinary student account.
    const reviewEmail = process.env.REVIEW_LOGIN_EMAIL?.toLowerCase().trim();
    const reviewCode = process.env.REVIEW_LOGIN_CODE ?? "";
    if (reviewEmail && /^\d{6}$/.test(reviewCode) && email === reviewEmail) {
      if (!timingSafeEqual(Buffer.from(body.code), Buffer.from(reviewCode))) throw badRequest("Invalid or expired code");
      const reviewer = await prisma.user.upsert({ where: { email }, create: { email, name: "App Review" }, update: {} });
      return signIn(reviewer, req.tenant);
    }

    const user = await prisma.user.findUnique({ where: { email } });
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
    if (tenant) user = await fillFromStudentList(user, tenant);
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
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "events-site" },
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

  /** Change email, step 1: send a code to the new address (it must not belong to another account). */
  app.post("/me/email/start", async (req) => {
    const tenant = requireTenant(req);
    const { user } = requireUser(req);
    const email = z.object({ email: z.string().trim().email().max(200) }).parse(req.body).email.toLowerCase();
    if (email === user.email) throw badRequest("That's already your email");
    if (await prisma.user.findUnique({ where: { email } })) throw badRequest("Another account already uses this email");
    const recent = await prisma.otpCode.count({ where: { userId: user.id, purpose: "email_change", usedAt: null, expiresAt: { gt: new Date() } } });
    if (recent >= MAX_ACTIVE_CODES) throw badRequest("Too many codes requested. Please wait a few minutes.");
    const code = otpCode();
    await prisma.otpCode.create({
      data: { userId: user.id, purpose: "email_change", email, codeHash: sha256(`${user.id}:${email}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    const dev = process.env.NODE_ENV !== "production";
    if (dev) req.log.info({ email, code }, "email change code (dev only)");
    const subject = `${code} is your code to confirm this email`;
    const text = `Use ${code} to make this your email address on ${tenant.name} Events.\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.`;
    const sent = await sendEmail({ from: fromAddress(tenant), to: email, subject, text, html: await renderEmailHtml(tenant, subject, text) }).catch(() => null);
    if (!dev && sent?.status !== "SENT") throw badRequest("We couldn't send the code. Please check the address and try again.");
    return { ok: true, ...(dev ? { devCode: code } : {}) };
  });

  /** Change email, step 2: confirm the code; the new address becomes the sign-in email. */
  app.post("/me/email/verify", async (req) => {
    const { user } = requireUser(req);
    const body = z.object({ email: z.string().trim().email(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const email = body.email.toLowerCase();
    const otp = await prisma.otpCode.findFirst({
      where: { userId: user.id, purpose: "email_change", email, codeHash: sha256(`${user.id}:${email}:${body.code}`), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!otp) throw badRequest("Invalid or expired code");
    if (await prisma.user.findUnique({ where: { email } })) throw badRequest("Another account already uses this email");
    await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    return prisma.user.update({ where: { id: user.id }, data: { email } });
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
        // Coding profiles: a link or just the username
        leetcodeUrl: text(200).transform((v) => profileUrl(v, "https://leetcode.com/u/", /leetcode\.com\//i)),
        gfgUrl: text(200).transform((v) => profileUrl(v, "https://www.geeksforgeeks.org/user/", /geeksforgeeks\.org\//i)),
        codechefUrl: text(200).transform((v) => profileUrl(v, "https://www.codechef.com/users/", /codechef\.com\//i)),
        hackerrankUrl: text(200).transform((v) => profileUrl(v, "https://www.hackerrank.com/profile/", /hackerrank\.com\//i)),
        codeforcesUrl: text(200).transform((v) => profileUrl(v, "https://codeforces.com/profile/", /codeforces\.com\//i)),
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

/**
 * Students already in the institute's student list don't have to type their details: on sign-in, empty
 * profile fields (name, mobile, college, program, graduation year) and their campus and batch are filled
 * from the list. They can change everything later on their profile page.
 */
async function fillFromStudentList(user: User, tenant: Tenant): Promise<User> {
  const s = await prisma.student.findFirst({
    where: { tenantId: tenant.id, email: user.email.toLowerCase(), active: true },
    include: { campus: { select: { name: true } } },
    orderBy: { batch: "desc" },
  });
  if (!s) return user;
  const placeholder = !user.name || user.name === user.email.split("@")[0];
  const data = {
    ...(placeholder && s.name && { name: s.name }),
    ...(!user.phone && s.phone && { phone: /^\d{10}$/.test(s.phone) ? `+91${s.phone}` : s.phone }),
    ...(!user.college && (s.campus?.name || s.campusName) && { college: s.campus?.name ?? s.campusName }),
    ...(!user.degree && s.program && { degree: s.program }),
    ...(!user.graduationYear && s.passingYear && { graduationYear: s.passingYear }),
  };
  const next = { ...user, ...data };
  const complete = !next.profileCompletedAt && next.name && next.name !== next.email.split("@")[0] && next.phone && next.college;
  if (Object.keys(data).length || complete) {
    user = await prisma.user.update({ where: { id: user.id }, data: { ...data, ...(complete && { profileCompletedAt: new Date() }) } });
  }
  if (!s.userId) await prisma.student.update({ where: { id: s.id }, data: { userId: user.id } });
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } } });
  if (m && (!m.campusId || !m.batch)) {
    await prisma.membership.update({
      where: { id: m.id },
      data: { ...(!m.campusId && s.campusId && { campusId: s.campusId }), ...(!m.batch && s.batch && { batch: String(s.batch) }) },
    });
  }
  return user;
}
