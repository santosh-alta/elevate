import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MEDIA_KINDS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, canCheckIn, findEvent, requireUser } from "../lib/permissions";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { readUpload } from "../lib/multipart";
import { isValidKey, mimeForKey, storage, storeUpload } from "../lib/storage";

export function uploadRoutes(app: FastifyInstance) {
  /**
   * Multipart upload: `file` + optional `eventId`, `kind`, `caption`.
   * With eventId + kind (and permission on the event) a MediaAsset is created too.
   */
  app.post("/uploads", async (req, reply) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const { buffer, filename, fields } = await readUpload(req);
    const meta = z
      .object({
        eventId: z.string().optional(),
        kind: z.enum(MEDIA_KINDS).optional(),
        caption: z.string().max(500).optional(),
        title: z.string().max(200).optional(),
      })
      .parse(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "")));
    if (meta.kind && !meta.eventId) throw badRequest("kind needs an eventId");

    // Check permission before storing anything.
    let event = null;
    if (meta.eventId) {
      event = await findEvent(req, meta.eventId);
      if (meta.kind) {
        const crew = await prisma.eventStaff.findFirst({
          where: { eventId: event.id, userId: user.id, role: { in: ["PHOTOGRAPHER", "SOCIAL"] } },
        });
        if (!crew && !(await canCheckIn(req, event))) throw forbidden("You can't add media to this event");
      }
    }

    const file = await storeUpload(tenant.slug, buffer);
    let media = null;
    if (event && meta.kind) {
      media = await prisma.mediaAsset.create({
        data: {
          eventId: event.id, kind: meta.kind, url: file.url, storageKey: file.key, mimeType: file.mimeType, sizeBytes: file.sizeBytes,
          caption: meta.caption, title: meta.title ?? filename?.slice(0, 200), uploadedById: user.id,
        },
      });
      await logActivity(event.id, user.id, "media.uploaded", { kind: media.kind, mediaId: media.id });
    }
    return reply.status(201).send({ url: file.url, key: file.key, mimeType: file.mimeType, sizeBytes: file.sizeBytes, media });
  });

  /** Serves files from the local storage driver. Keys are random, so links are unguessable but public. */
  app.get<{ Params: { "*": string } }>("/files/*", async (req, reply) => {
    const key = req.params["*"];
    if (!isValidKey(key)) throw notFound("File");
    const data = await storage.get(key);
    if (!data) throw notFound("File");
    return reply
      .type(mimeForKey(key))
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'")
      .send(data);
  });

  app.patch<{ Params: { mediaId: string } }>("/media/:mediaId", async (req) => {
    const media = await prisma.mediaAsset.findUnique({ where: { id: req.params.mediaId }, include: { event: true } });
    if (!media) throw notFound("Media");
    await assertManageable(req, media.event);
    const body = z
      .object({
        caption: z.string().max(500).nullable().optional(),
        title: z.string().max(200).nullable().optional(),
        isHighlight: z.boolean().optional(),
        approvedForSocial: z.boolean().optional(),
        kind: z.enum(MEDIA_KINDS).optional(),
      })
      .parse(req.body);
    const { event: _e, ...rest } = await prisma.mediaAsset.update({ where: { id: media.id }, data: body, include: { event: true } });
    return rest;
  });
}
