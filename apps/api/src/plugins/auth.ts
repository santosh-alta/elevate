import type { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import type { Membership, User } from "@prisma/client";
import { prisma } from "./prisma";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; typ?: string; ch?: string };
    user: { sub: string };
  }
}

export interface AuthContext {
  user: User;
  /** Membership in the resolved tenant (null if the user isn't a member of this brand). */
  membership: Membership | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function authPlugin(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production");
  await app.register(fastifyJwt, { secret: secret ?? "dev-secret", sign: { expiresIn: "30d" } });

  app.decorateRequest("auth", null);

  // Runs after tenant resolution (hooks run in registration order).
  app.addHook("onRequest", async (req) => {
    if (!req.headers.authorization?.startsWith("Bearer ")) return;
    try {
      const { sub, typ } = await req.jwtVerify<{ sub: string; typ?: string }>();
      if (typ) return; // purpose-bound tokens (e.g. app sign-in handoff codes) are never sessions
      const user = await prisma.user.findUnique({ where: { id: sub } });
      if (!user) return;
      const membership = req.tenant
        ? await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: req.tenant.id, userId: user.id } } })
        : null;
      req.auth = { user, membership };
    } catch {
      // Invalid/expired token: treat as anonymous; protected routes return 401.
    }
  });
}
