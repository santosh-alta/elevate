import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, requireEventManager, requireUser } from "../lib/permissions";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors";
import { CERTIFICATE_TITLES, certificateLinks, generateCertificates, renderCertificatePdf } from "../lib/certificates";
import { POST_STYLES, aiLinkedInPost, draftContextFor, generateLinkedInDrafts, shareUrl, type PostStyle } from "../lib/linkedin";
import { usageOf, withAllowance, writeLimitFor } from "../lib/aiUsage";
import { logActivity } from "../lib/activity";
import { themeOf } from "../lib/brand";

const withEvent = { event: { include: { tenant: true } } } as const;

export function certificateRoutes(app: FastifyInstance) {
  // ───────── Certificates ─────────
  app.post<{ Params: { id: string } }>("/events/:id/certificates/generate", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const result = await generateCertificates(event.id);
    await logActivity(event.id, req.auth!.user.id, "certificates.generated", result);
    return result;
  });

  app.get<{ Params: { id: string } }>("/events/:id/certificates", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.certificate.findMany({
      where: { eventId: event.id },
      orderBy: [{ type: "asc" }, { recipientName: "asc" }],
      include: { user: { select: { id: true, email: true } } },
    });
  });

  app.post<{ Params: { certId: string } }>("/certificates/:certId/revoke", async (req) => {
    const cert = await prisma.certificate.findUnique({ where: { id: req.params.certId }, include: { event: true } });
    if (!cert) throw notFound("Certificate");
    await assertManageable(req, cert.event);
    const updated = await prisma.certificate.update({ where: { id: cert.id }, data: { revokedAt: new Date() } });
    await logActivity(cert.eventId, req.auth!.user.id, "certificate.revoked", { serial: cert.serial });
    return updated;
  });

  app.get("/me/certificates", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const certs = await prisma.certificate.findMany({
      where: { userId: user.id, revokedAt: null, event: { tenantId: tenant.id } },
      orderBy: { issuedAt: "desc" },
      include: withEvent,
    });
    return Promise.all(
      certs.map(async (c) => ({
        id: c.id, serial: c.serial, type: c.type, title: CERTIFICATE_TITLES[c.type], recipientName: c.recipientName,
        detail: c.detail, issuedAt: c.issuedAt,
        event: { id: c.event.id, slug: c.event.slug, title: c.event.title, startsAt: c.event.startsAt },
        ...(await certificateLinks(c)),
      })),
    );
  });

  /** Public PDF: GET /v1/certificates/ELV-XXXX-XXXX.pdf */
  app.get<{ Params: { file: string } }>("/certificates/:file", async (req, reply) => {
    if (!req.params.file.endsWith(".pdf")) throw notFound("Certificate");
    const serial = req.params.file.slice(0, -4).toUpperCase();
    const cert = await prisma.certificate.findUnique({ where: { serial }, include: withEvent });
    if (!cert) throw notFound("Certificate");
    if (cert.revokedAt) throw new HttpError(410, "revoked", "This certificate has been revoked");
    const pdf = await renderCertificatePdf(cert);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `inline; filename="${serial}.pdf"`)
      .header("Cache-Control", "public, max-age=3600")
      .send(Buffer.from(pdf));
  });

  /** Public verification. */
  app.get<{ Params: { serial: string } }>("/verify/:serial", async (req) => {
    const cert = await prisma.certificate.findUnique({ where: { serial: req.params.serial.toUpperCase() }, include: withEvent });
    if (!cert) return { valid: false };
    const links = await certificateLinks(cert);
    return {
      valid: !cert.revokedAt,
      revoked: !!cert.revokedAt,
      serial: cert.serial,
      recipientName: cert.recipientName,
      type: cert.type,
      title: CERTIFICATE_TITLES[cert.type],
      detail: cert.detail,
      issuedAt: cert.issuedAt,
      event: { title: cert.event.title, type: cert.event.type, startsAt: cert.event.startsAt, endsAt: cert.event.endsAt },
      brand: { name: cert.event.tenant.name, slug: cert.event.tenant.slug, theme: themeOf(cert.event.tenant) },
      pdfUrl: links.pdfUrl,
    };
  });

  // ───────── LinkedIn drafts ─────────
  app.post<{ Params: { id: string } }>("/events/:id/linkedin/generate", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const result = await generateLinkedInDrafts(event.id);
    await logActivity(event.id, req.auth!.user.id, "linkedin.generated", result);
    // Tick the matching checklist item.
    await prisma.eventTask.updateMany({
      where: { eventId: event.id, phase: "POST", title: { contains: "LinkedIn", mode: "insensitive" }, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() },
    });
    return result;
  });

  app.get<{ Params: { id: string } }>("/events/:id/linkedin", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const posts = await prisma.linkedInPost.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true, linkedinUrl: true } } },
    });
    const byStatus = posts.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {});
    return { total: posts.length, byStatus, posts };
  });

  app.get("/me/linkedin", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const { eventId } = z.object({ eventId: z.string().optional() }).parse(req.query);
    const posts = await prisma.linkedInPost.findMany({
      where: { userId: user.id, event: { tenantId: tenant.id, ...(eventId && { OR: [{ id: eventId }, { slug: eventId }] }) } },
      orderBy: { createdAt: "desc" },
      include: { event: { select: { id: true, slug: true, title: true, startsAt: true } } },
    });
    return posts.map((p) => ({ ...p, shareUrl: shareUrl(p.draft) }));
  });

  /** The participant asks AI for a fresh, engaging version of their post. Counts toward their daily AI uses. */
  app.post<{ Params: { postId: string } }>("/linkedin/:postId/ai", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const post = await prisma.linkedInPost.findUnique({ where: { id: req.params.postId }, include: { event: true } });
    if (!post || post.event.tenantId !== tenant.id) throw notFound("LinkedIn draft");
    if (post.userId !== user.id) throw forbidden();
    const { style } = z.object({ style: z.enum(Object.keys(POST_STYLES) as [PostStyle, ...PostStyle[]]).default("story") }).parse(req.body ?? {});
    const ctx = await draftContextFor(post.eventId, user.id);
    const limit = writeLimitFor(req);
    const out = await withAllowance(
      { id: user.id, tenantId: tenant.id }, "write", limit,
      () => aiLinkedInPost(ctx, style),
      `You've used all ${limit} AI uses for today. They reset at midnight.`,
    );
    const updated = await prisma.linkedInPost.update({
      where: { id: post.id },
      data: { draft: out.text.slice(0, 3000), generatedBy: "ai", ...(post.status === "SKIPPED" && { status: "SUGGESTED" }) },
    });
    return { ...updated, shareUrl: shareUrl(updated.draft), usage: await usageOf(user.id, "write", limit) };
  });

  app.patch<{ Params: { postId: string } }>("/linkedin/:postId", async (req) => {
    const { user } = requireUser(req);
    const post = await prisma.linkedInPost.findUnique({ where: { id: req.params.postId }, include: { event: true } });
    if (!post || post.event.tenantId !== requireTenant(req).id) throw notFound("LinkedIn draft");
    if (post.userId !== user.id) throw forbidden();
    const body = z
      .object({
        draft: z.string().min(1).max(3000).optional(),
        status: z.enum(["EDITED", "POSTED", "SKIPPED"]).optional(),
        postUrl: z.string().url().optional(),
      })
      .parse(req.body);
    if (body.postUrl && !/linkedin\.com/i.test(body.postUrl)) throw badRequest("Please paste the link to your LinkedIn post");
    const status = body.postUrl ? "POSTED" : body.status ?? (body.draft ? "EDITED" : post.status);
    const updated = await prisma.linkedInPost.update({
      where: { id: post.id },
      data: {
        ...(body.draft && { draft: body.draft }),
        ...(body.postUrl && { postUrl: body.postUrl }),
        status,
        ...(status === "POSTED" && !post.postedAt && { postedAt: new Date() }),
      },
    });
    if (status === "POSTED" && post.status !== "POSTED") {
      await logActivity(post.eventId, user.id, "linkedin.posted", { url: updated.postUrl });
    }
    return { ...updated, shareUrl: shareUrl(updated.draft) };
  });
}
