import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MediaKind } from "@prisma/client";
import { MEDIA_KINDS, SOCIAL_PLATFORMS, socialEmbed } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, canCheckIn, canManageEvent, findEvent, isStaff, requireEventManager, requireStaff, requireUser } from "../lib/permissions";
import { forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { aiCaption, captionFacts, templateCaption } from "../lib/social";
import { ZipArchive } from "archiver";
import { isValidKey, storage } from "../lib/storage";
import { notifyGallery } from "../lib/notify";
import { badRequest } from "../lib/errors";

const HIDDEN = ["DRAFT", "PLANNING"];
const MAX_ZIP_PHOTOS = 500;

/** Bytes of a photo: from our storage when we have the key, else fetched from its URL. */
async function photoBytes(m: { url: string; storageKey: string | null }): Promise<Buffer | null> {
  if (m.storageKey && isValidKey(m.storageKey)) {
    const local = await storage.get(m.storageKey);
    if (local) return local;
  }
  // Our own /files URLs map straight back to storage.
  const own = /\/v1\/files\/(.+)$/.exec(m.url);
  if (own && isValidKey(own[1])) {
    const local = await storage.get(own[1]);
    if (local) return local;
  }
  if (!/^https?:\/\//i.test(m.url)) return null;
  try {
    const res = await fetch(m.url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function extOf(m: { storageKey: string | null; mimeType: string | null; url: string }): string {
  const fromKey = m.storageKey?.split(".").pop();
  if (fromKey && fromKey.length <= 5) return fromKey;
  if (m.mimeType?.startsWith("image/")) return m.mimeType.slice(6).replace("jpeg", "jpg");
  const fromUrl = /\.(jpe?g|png|webp|gif|heic)(?:[?#]|$)/i.exec(m.url)?.[1];
  return fromUrl?.toLowerCase().replace("jpeg", "jpg") ?? "jpg";
}

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

  // ───────── Gallery for participants ─────────
  app.get<{ Params: { id: string } }>("/events/:id/gallery", async (req) => {
    const event = await findEvent(req, req.params.id);
    if (HIDDEN.includes(event.status) && !(await canManageEvent(req, event))) throw notFound("Event");
    const q = z
      .object({
        highlights: z.coerce.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40),
      })
      .parse(req.query);
    const items = await prisma.mediaAsset.findMany({
      where: { eventId: event.id, kind: "PHOTO", ...(q.highlights && { isHighlight: true }) },
      orderBy: [{ isHighlight: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      select: { id: true, url: true, title: true, caption: true, isHighlight: true, mimeType: true, createdAt: true },
    });
    const more = items.length > q.limit;
    const page = more ? items.slice(0, q.limit) : items;
    const total = await prisma.mediaAsset.count({ where: { eventId: event.id, kind: "PHOTO", ...(q.highlights && { isHighlight: true }) } });
    return { items: page, nextCursor: more ? page.at(-1)!.id : null, total, driveFolderUrl: event.driveFolderUrl };
  });

  app.post<{ Params: { id: string } }>("/events/:id/gallery/notify", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const photos = await prisma.mediaAsset.count({ where: { eventId: event.id, kind: { in: ["PHOTO", "PHOTO_ALBUM"] } } });
    if (!photos && !event.driveFolderUrl) throw badRequest("Add some photos or a Drive folder first");
    const recipients = await notifyGallery(event.id);
    await logActivity(event.id, req.auth!.user.id, "gallery.notified", { recipients });
    return { ok: true, recipients };
  });

  app.get<{ Params: { id: string } }>("/events/:id/gallery.zip", async (req, reply) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    if (!(await canManageEvent(req, event))) {
      const reg = await prisma.registration.findFirst({
        where: { eventId: event.id, userId: user.id, status: { in: ["REGISTERED", "APPROVED", "CHECKED_IN"] } },
      });
      if (!reg) throw forbidden("Only attendees can download the photos");
    }
    const photos = await prisma.mediaAsset.findMany({
      where: { eventId: event.id, kind: "PHOTO" },
      orderBy: [{ isHighlight: "desc" }, { createdAt: "asc" }],
      take: MAX_ZIP_PHOTOS,
    });
    if (!photos.length) throw notFound("Photos");

    // Photos are already compressed: store them as-is and stream entries as they are read.
    const archive = new ZipArchive({ zlib: { level: 0 } });
    archive.on("warning", (err) => req.log.warn({ err }, "gallery zip warning"));
    archive.on("error", (err) => req.log.error({ err }, "gallery zip failed"));
    void (async () => {
      let n = 0;
      for (const m of photos) {
        const data = await photoBytes(m);
        if (!data) continue;
        n++;
        archive.append(data, { name: `${String(n).padStart(3, "0")}${m.isHighlight ? "-highlight" : ""}.${extOf(m)}`, date: m.createdAt });
      }
      if (!n) archive.append(`No photos could be downloaded. See ${event.driveFolderUrl ?? "the event page"}.\n`, { name: "README.txt" });
      await archive.finalize();
    })().catch((err) => {
      req.log.error({ err }, "gallery zip failed");
      archive.abort();
    });
    return reply
      .type("application/zip")
      .header("Content-Disposition", `attachment; filename="${event.slug}-photos.zip"`)
      .header("Cache-Control", "private, no-store")
      .send(archive);
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

  /**
   * "From the community": a LinkedIn, Instagram or YouTube post (official or by a participant) shown as an
   * embedded preview on the public event page. Event managers and the Social media team can add them.
   */
  app.post<{ Params: { id: string } }>("/events/:id/highlights", async (req, reply) => {
    const event = await findEvent(req, req.params.id);
    const socialTeam = req.auth?.membership?.teams?.includes("SOCIAL_MEDIA");
    if (!(await canManageEvent(req, event)) && !(socialTeam && isStaff(req))) throw forbidden("Only the event's managers or the Social media team can add posts");
    const body = z.object({ url: z.string().url(), authorName: z.string().trim().max(120).optional() }).parse(req.body);
    const embed = socialEmbed(body.url);
    if (!embed) throw badRequest("Paste a public LinkedIn post, Instagram post or reel, or YouTube video link");
    const dup = await prisma.socialPost.findFirst({ where: { eventId: event.id, url: embed.url } });
    const post = dup
      ? await prisma.socialPost.update({ where: { id: dup.id }, data: { featured: true, ...(body.authorName !== undefined && { authorName: body.authorName || null }) } })
      : await prisma.socialPost.create({
          data: { eventId: event.id, platform: embed.platform, url: embed.url, status: "POSTED", postedAt: new Date(), featured: true, authorName: body.authorName || null, ownerId: req.auth!.user.id },
        });
    await logActivity(event.id, req.auth!.user.id, "social.featured", { platform: post.platform, url: post.url });
    return reply.status(dup ? 200 : 201).send(post);
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
        featured: z.boolean().optional(),
        authorName: z.string().trim().max(120).nullable().optional(),
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
