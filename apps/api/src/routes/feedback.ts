import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireBrandAdmin } from "../lib/permissions";
import { badRequest } from "../lib/errors";

const text = z.string().trim().max(3000).optional().transform((v) => v || null);

/** Feedback about the site: anyone can send it (signed in or not); staff read it in admin. */
export function feedbackRoutes(app: FastifyInstance) {
  app.post("/feedback", async (req, reply) => {
    const tenant = requireTenant(req);
    const body = z
      .object({
        name: z.string().trim().max(120).optional(),
        email: z.string().trim().email().max(200).optional().or(z.literal("")),
        campus: z.string().trim().max(120).optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        liked: text, confusing: text, missing: text, broken: text,
      })
      .parse(req.body);
    if (!body.rating && !body.liked && !body.confusing && !body.missing && !body.broken) {
      throw badRequest("Please add a rating or a few words");
    }
    const user = req.auth?.user;
    const fb = await prisma.siteFeedback.create({
      data: {
        tenantId: tenant.id, userId: user?.id ?? null,
        name: body.name || user?.name || null, email: body.email || user?.email || null, campus: body.campus || null,
        rating: body.rating ?? null, liked: body.liked, confusing: body.confusing, missing: body.missing, broken: body.broken,
      },
    });
    return reply.status(201).send({ ok: true, id: fb.id });
  });

  app.get("/admin/feedback", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const items = await prisma.siteFeedback.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 500 });
    const rated = items.filter((f) => f.rating);
    return { items, count: items.length, averageRating: rated.length ? rated.reduce((n, f) => n + (f.rating ?? 0), 0) / rated.length : null };
  });
}
