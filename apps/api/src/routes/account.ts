import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireUser } from "../lib/permissions";
import { badRequest } from "../lib/errors";

/**
 * The signed-in person's own account: phones for push notifications, and deleting the account
 * (required by Google Play and the App Store for apps with sign-in; also on the website).
 */
export function accountRoutes(app: FastifyInstance) {
  app.post("/me/push-tokens", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const b = z.object({ token: z.string().regex(/^(Exponent|Expo)PushToken\[[^\]]+\]$/, "Not an Expo push token"), platform: z.enum(["android", "ios"]) }).parse(req.body);
    await prisma.pushToken.upsert({
      where: { token: b.token },
      create: { token: b.token, platform: b.platform, userId: user.id, tenantId: tenant.id },
      update: { userId: user.id, tenantId: tenant.id, platform: b.platform, lastSeenAt: new Date() },
    });
    return { ok: true };
  });

  /** Sign-out on a phone: stop pushing to it. */
  app.delete("/me/push-tokens", async (req) => {
    const { user } = requireUser(req);
    const { token } = z.object({ token: z.string() }).parse(req.body ?? {});
    await prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
    return { ok: true };
  });

  /**
   * Delete my account. Personal details are erased and sign-in stops working; past participation stays
   * as anonymous numbers (attendance counts, team results) so event reports remain correct.
   */
  app.delete("/me", async (req) => {
    const { user } = requireUser(req);
    z.object({ confirm: z.literal("DELETE") }).parse(req.body ?? {});
    if (user.isPlatformAdmin) throw badRequest("The super admin account can't be deleted here.");
    const now = new Date();
    await prisma.$transaction([
      prisma.pushToken.deleteMany({ where: { userId: user.id } }),
      prisma.oAuthGrant.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.otpCode.deleteMany({ where: { userId: user.id } }),
      prisma.notification.deleteMany({ where: { userId: user.id } }),
      prisma.membership.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          name: "Deleted user", email: `deleted-${user.id}@deleted.invalid`, phone: null, avatarUrl: null, linkedinUrl: null,
          githubUrl: null, college: null, degree: null, graduationYear: null, city: null, portfolioUrl: null, leetcodeUrl: null,
          gfgUrl: null, codechefUrl: null, hackerrankUrl: null, codeforcesUrl: null, googleSub: null, githubId: null,
        },
      }),
    ]);
    return { ok: true };
  });
}
