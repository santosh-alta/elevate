import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MediaKind } from "@prisma/client";
import { MEDIA_KINDS, SOCIAL_PLATFORMS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, canCheckIn, canManageEvent, findEvent, requireEventManager, requireStaff, requireUser } from "../lib/permissions";
import { forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { aiCaption, captionFacts, templateCaption } from "../lib/social";

const PUBLIC_KINDS: MediaKind[] = ["PHOTO_ALBUM", "PHOTO", "VIDEO", "POSTER"];
const socialStatus = z.enum(["PLANNED", "DRAFTED", "POSTED"]);
const metricsSchema = z
  .object({ impressions: z.number().int().nonnegative().optional(), likes: z.number().int().nonnegative().optional(), comments: z.number().int().nonnegative().optional(), shares: z.number().int().nonnegative().optional() })
  .partial();

export function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/events/:id/media", async (req) => {
    const event = await findEvent(req, req.params.id);
    const manager = await canManageEvent(req, event);
    return prisma.mediaAsset.findMany({
      where: { eventId: event.id, ...(!manager && { kind: { in: PUBLIC_KINDS } }) },
      orderBy: { createdAt: "desc" },
    });
  });

  /** Managers, plus volunteers/photographers assigned to the event, can add media. */
  app.post<{ Params: { id: string } }>("/events/:id/media", async (req, reply) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const photographer = await prisma.eventStaff.findFirst({ where: { eventId: event.id, userId: user.id, role: { in: ["PHOTOGRAPHER", "SOCIAL"] } } });
    if (!photographer && !(await canCheckIn(req, event))) throw forbidden();
    const body = z.object({ kind: z.enum(MEDIA_KINDS), url: z.string().url(), title: z.string().optional() }).parse(req.body);
    const media = await prisma.mediaAsset.create({ data: { ...body, eventId: event.id, uploadedById: user.id } });
    await logActivity(event.id, user.id, "media.added", { kind: media.kind, title: media.title, url: media.url });
    return reply.status(201).send(media);
  });

  app.delete<{ Params: { mediaId: string } }>("/media/:mediaId", async (req) => {
    const media = await prisma.mediaAsset.findUnique({ where: { id: req.params.mediaId }, include: { event: true } });
    if (!media) throw notFound("Media");
    await assertManageable(req, media.event);
    await prisma.mediaAsset.delete({ where: { id: media.id } });
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>("/events/:id/drive", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { driveFolderUrl } = z.object({ driveFolderUrl: z.string().url() }).parse(req.body);
    const updated = await prisma.event.update({ where: { id: event.id }, data: { driveFolderUrl } });
    const exists = await prisma.mediaAsset.findFirst({ where: { eventId: event.id, kind: "PHOTO_ALBUM", url: driveFolderUrl } });
    if (!exists) {
      await prisma.mediaAsset.create({
        data: { eventId: event.id, kind: "PHOTO_ALBUM", url: driveFolderUrl, title: "Event photos (Drive)", uploadedById: req.auth!.user.id },
      });
    }
    // Tick the matching checklist item automatically.
    await prisma.eventTask.updateMany({
      where: { eventId: event.id, phase: "POST", title: { contains: "photos", mode: "insensitive" }, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date(), evidenceUrl: driveFolderUrl },
    });
    await logActivity(event.id, req.auth!.user.id, "drive.linked", { url: driveFolderUrl });
    return updated;
  });

  // ───────── Social posts ─────────
  app.get<{ Params: { id: string } }>("/events/:id/social", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.socialPost.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
  });

  app.post<{ Params: { id: string } }>("/events/:id/social", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = z
      .object({
        platform: z.enum(SOCIAL_PLATFORMS),
        status: socialStatus.default("PLANNED"),
        caption: z.string().optional(),
        url: z.string().url().optional(),
        ownerId: z.string().optional(),
      })
      .parse(req.body);
    const post = await prisma.socialPost.create({
      data: { ...body, eventId: event.id, ...(body.status === "POSTED" && { postedAt: new Date() }) },
    });
    await logActivity(event.id, req.auth!.user.id, "social.created", { platform: post.platform, status: post.status });
    return reply.status(201).send(post);
  });

  /** Drafts a caption per platform (AI when configured, else template). Posted rows are never touched. */
  app.post<{ Params: { id: string } }>("/events/:id/social/suggest", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { platforms } = z
      .object({ platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1).default(["LINKEDIN", "INSTAGRAM", "X"]) })
      .parse(req.body ?? {});
    const facts = await captionFacts(event.id);
    const existing = await prisma.socialPost.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
    const posts = [];
    const skipped: string[] = [];
    let usedAi = false;
    for (const platform of [...new Set(platforms)]) {
      const rows = existing.filter((p) => p.platform === platform);
      const open = rows.find((p) => p.status !== "POSTED");
      if (!open && rows.length) {
        skipped.push(platform);
        continue;
      }
      const ai = await aiCaption(platform, facts);
      usedAi ||= !!ai;
      const caption = ai ?? templateCaption(platform, facts);
      const generatedBy = ai ? "ai" : "template";
      posts.push(
        open
          ? await prisma.socialPost.update({ where: { id: open.id }, data: { caption, generatedBy, status: "DRAFTED" } })
          : await prisma.socialPost.create({ data: { eventId: event.id, platform, caption, generatedBy, status: "DRAFTED" } }),
      );
    }
    await logActivity(event.id, req.auth!.user.id, "social.suggested", { platforms: posts.map((p) => p.platform), generatedBy: usedAi ? "ai" : "template" });
    return { posts, skipped, generatedBy: usedAi ? "ai" : "template" };
  });

  app.patch<{ Params: { postId: string } }>("/social/:postId", async (req) => {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.postId }, include: { event: true } });
    if (!post) throw notFound("Social post");
    await assertManageable(req, post.event);
    const body = z
      .object({
        status: socialStatus.optional(),
        caption: z.string().nullable().optional(),
        url: z.string().url().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        metrics: metricsSchema.optional(),
      })
      .parse(req.body);
    const updated = await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        ...body,
        ...(body.metrics && { metrics: { ...((post.metrics as object) ?? {}), ...body.metrics } }),
        ...(body.status === "POSTED" && !post.postedAt && { postedAt: new Date() }),
      },
    });
    if (body.status && body.status !== post.status) {
      await logActivity(post.eventId, req.auth!.user.id, "social.status", { platform: post.platform, status: body.status, url: updated.url });
    }
    return updated;
  });

  app.delete<{ Params: { postId: string } }>("/social/:postId", async (req) => {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.postId }, include: { event: true } });
    if (!post) throw notFound("Social post");
    await assertManageable(req, post.event);
    await prisma.socialPost.delete({ where: { id: post.id } });
    return { ok: true };
  });

  /** Social team queue: finished events that have photos but whose social posts aren't all done. */
  app.get("/social/queue", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const events = await prisma.event.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["LIVE", "JUDGING", "COMPLETED"] },
        OR: [{ driveFolderUrl: { not: null } }, { media: { some: { kind: { in: ["PHOTO_ALBUM", "PHOTO", "VIDEO"] } } } }],
      },
      orderBy: { endsAt: "desc" },
      include: { socialPosts: true, media: { where: { kind: { in: ["PHOTO_ALBUM", "PHOTO", "VIDEO", "POSTER"] } } } },
    });
    return events
      .filter((e) => !e.socialPosts.length || e.socialPosts.some((p) => p.status !== "POSTED"))
      .map((e) => ({
        id: e.id, slug: e.slug, title: e.title, type: e.type, status: e.status, endsAt: e.endsAt,
        driveFolderUrl: e.driveFolderUrl, media: e.media,
        social: e.socialPosts.map((p) => ({ id: p.id, platform: p.platform, status: p.status, url: p.url })),
        pending: e.socialPosts.length ? e.socialPosts.filter((p) => p.status !== "POSTED").length : null,
      }));
  });
}
