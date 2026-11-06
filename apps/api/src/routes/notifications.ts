import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireEventManager, requireUser } from "../lib/permissions";
import { notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { fanOutAnnouncement } from "../lib/notify";

export function notificationRoutes(app: FastifyInstance) {
  app.get("/me/notifications", async (req) => {
    const { user } = requireUser(req);
    const { unread, limit } = z
      .object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);
    const items = await prisma.notification.findMany({
      where: {
        userId: user.id,
        channel: "IN_APP",
        ...(req.tenant && { tenantId: req.tenant.id }),
        ...(unread && { readAt: null }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { event: { select: { id: true, slug: true, title: true } } },
    });
    return items.map((n) => {
      const data = (n.data ?? {}) as { ctaLabel?: string; ctaUrl?: string };
      return {
        id: n.id, template: n.template, subject: n.subject, body: n.body, createdAt: n.createdAt, readAt: n.readAt,
        ctaLabel: data.ctaLabel ?? null, ctaUrl: data.ctaUrl ?? null, event: n.event,
      };
    });
  });

  app.post("/me/notifications/read", async (req) => {
    const { user } = requireUser(req);
    const { ids } = z.object({ ids: z.array(z.string()).max(500).optional() }).parse(req.body ?? {});
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        channel: "IN_APP",
        readAt: null,
        ...(req.tenant && { tenantId: req.tenant.id }),
        ...(ids && { id: { in: ids } }),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });

  /** Outbox for one event: what was sent to whom, and what failed. */
  app.get<{ Params: { id: string } }>("/events/:id/notifications", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { status, template } = z.object({ status: z.string().optional(), template: z.string().optional() }).parse(req.query);
    const rows = await prisma.notification.findMany({
      where: { eventId: event.id, ...(status && { status: status as never }), ...(template && { template }) },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const summary = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
    return { summary, items: rows };
  });

  app.post<{ Params: { id: string; announcementId: string } }>("/events/:id/announcements/:announcementId/send", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const a = await prisma.announcement.findFirst({ where: { id: req.params.announcementId, eventId: event.id } });
    if (!a) throw notFound("Announcement");
    const recipients = await fanOutAnnouncement(a.id);
    await logActivity(event.id, req.auth!.user.id, "announcement.sent", { title: a.title, channels: a.channels, recipients });
    return { ok: true, recipients };
  });
}
