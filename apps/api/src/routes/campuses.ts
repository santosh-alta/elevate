import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { notFound } from "../lib/errors";

/** Events the public may see: published and approved. */
const PUBLIC_EVENT: Prisma.EventWhereInput = { status: { notIn: ["DRAFT", "PLANNING"] }, approvalStatus: "APPROVED" };

/** Campus code in URLs, e.g. "adypu". */
const codeOf = (c: { code: string }) => c.code.toLowerCase();

/** Participants for an event: registrations here, else the figure recorded for events run before the site. */
function turnout(e: { config: Prisma.JsonValue; _count: { registrations: number } }): number {
  if (e._count.registrations) return e._count.registrations;
  const c = (e.config ?? {}) as Record<string, unknown>;
  return Number(c.participants ?? 0) || Number(c.registered ?? 0) || 0;
}

export function campusRoutes(app: FastifyInstance) {
  /** All campuses with their photo and how many public events they have coming up and have run. */
  app.get("/campuses", async (req) => {
    const tenant = requireTenant(req);
    const now = new Date();
    const campuses = await prisma.campus.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
    return Promise.all(
      campuses.map(async (c) => {
        const where = { tenantId: tenant.id, campuses: { some: { campusId: c.id } }, ...PUBLIC_EVENT };
        const [upcoming, past] = await Promise.all([
          prisma.event.count({ where: { ...where, endsAt: { gte: now }, status: { notIn: ["DRAFT", "PLANNING", "CANCELLED"] } } }),
          prisma.event.count({ where: { ...where, endsAt: { lt: now }, status: { not: "CANCELLED" } } }),
        ]);
        return { id: c.id, code: c.code, slug: codeOf(c), name: c.name, city: c.city, photoUrl: c.photoUrl, details: c.details, upcoming, past };
      }),
    );
  });

  /** One campus: profile, highlights and a photo gallery from its events. Events themselves come from /events?campusId=…&campusOnly=true. */
  app.get<{ Params: { code: string } }>("/campuses/:code", async (req) => {
    const tenant = requireTenant(req);
    const campus = await prisma.campus.findFirst({ where: { tenantId: tenant.id, code: { equals: req.params.code, mode: "insensitive" } } });
    if (!campus) throw notFound("Campus");
    const now = new Date();
    const held = await prisma.event.findMany({
      where: { tenantId: tenant.id, campuses: { some: { campusId: campus.id } }, ...PUBLIC_EVENT, endsAt: { lt: now }, status: { not: "CANCELLED" } },
      select: { id: true, type: true, config: true, _count: { select: { registrations: true } } },
    });
    const photos = await prisma.mediaAsset.findMany({
      where: { kind: "PHOTO", event: { tenantId: tenant.id, campuses: { some: { campusId: campus.id } }, ...PUBLIC_EVENT } },
      orderBy: [{ isHighlight: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: { id: true, url: true, caption: true, event: { select: { slug: true, title: true } } },
    });
    return {
      id: campus.id, code: campus.code, slug: codeOf(campus), name: campus.name, city: campus.city, address: campus.address,
      photoUrl: campus.photoUrl, details: campus.details,
      stats: {
        eventsHeld: held.length,
        participants: held.reduce((n, e) => n + turnout(e), 0),
        hackathons: held.filter((e) => ["HACKATHON", "COMPETITION", "CODING_CONTEST"].includes(e.type)).length,
      },
      eventPhotos: photos.map((m) => ({ id: m.id, url: m.url, caption: m.caption, eventSlug: m.event.slug, eventTitle: m.event.title })),
    };
  });
}
