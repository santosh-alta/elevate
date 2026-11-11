import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, requireBrandAdmin, requireEventManager, requireStaff, requireUser } from "../lib/permissions";
import { brandDesigns, designSchema, designerTemplatePdf, eventDesigns } from "../lib/certificateDesign";
import type { Prisma } from "@prisma/client";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors";
import { CERTIFICATE_TITLES, certificateLinks, generateCertificates, renderCertificatePdf } from "../lib/certificates";
import { POST_STYLES, aiLinkedInPost, draftContextFor, generateLinkedInDrafts, shareUrl, type PostStyle } from "../lib/linkedin";
import { usageOf, withAllowance, writeLimitFor } from "../lib/aiUsage";
import { logActivity } from "../lib/activity";
import { themeOf } from "../lib/brand";
import { socialEmbed } from "@elevate/shared";

/**
 * A participant's posted LinkedIn link shows in "From the community" on the public event page.
 * Only real post links (that can be embedded) are shown; a newer link from the same person replaces their older one.
 * Admins can still hide any post from the event's Social tab.
 */
async function featureOnEventPage(eventId: string, userId: string, name: string, url: string): Promise<boolean> {
  const embed = socialEmbed(url);
  if (!embed || embed.platform !== "LINKEDIN") return false;
  const mine = await prisma.socialPost.findMany({ where: { eventId, ownerId: userId, platform: "LINKEDIN", generatedBy: "participant" } });
  const same = mine.find((p) => p.url === embed.url);
  const others = mine.filter((p) => p.url !== embed.url).map((p) => p.id);
  if (others.length) await prisma.socialPost.deleteMany({ where: { id: { in: others } } });
  if (same) return same.featured;
  await prisma.socialPost.create({
    data: { eventId, platform: "LINKEDIN", url: embed.url, status: "POSTED", postedAt: new Date(), featured: true, authorName: name, ownerId: userId, generatedBy: "participant" },
  });
  return true;
}

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

  /** Public PDF: GET /v1/certificates/ALTA-XXXX-XXXX.pdf */
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

  // ── Certificate designs: the standard design, or our own artwork with the details printed on top ──

  const designBody = z.object({
    type: z.enum(["ALL", "PARTICIPATION", "FINALIST", "WINNER", "RUNNER_UP", "SPECIAL_MENTION", "JUDGE", "SPEAKER", "VOLUNTEER", "MENTOR"]),
    design: designSchema.nullable(),
  });

  /** One-page guide for designers: size, export settings and the areas to keep empty. */
  app.get("/certificate-designs/guide.pdf", async (req, reply) => {
    const tenant = requireTenant(req);
    const pdf = await designerTemplatePdf(tenant.name);
    return reply.type("application/pdf").header("Content-Disposition", 'attachment; filename="certificate-design-template.pdf"').send(Buffer.from(pdf));
  });

  app.get("/certificate-designs", async (req) => {
    requireStaff(req);
    return brandDesigns(requireTenant(req).settings);
  });

  app.put("/certificate-designs", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const { type, design } = designBody.parse(req.body);
    const fresh = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { settings: true } });
    const settings = (fresh.settings ?? {}) as Record<string, unknown>;
    const designs = { ...brandDesigns(settings) };
    if (design) designs[type] = design; else delete designs[type];
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: { ...settings, certificateDesigns: designs } as Prisma.InputJsonValue } });
    return designs;
  });

  app.get<{ Params: { id: string } }>("/events/:id/certificate-designs", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return { event: eventDesigns(event.config), brand: brandDesigns(requireTenant(req).settings) };
  });

  app.put<{ Params: { id: string } }>("/events/:id/certificate-designs", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { type, design } = designBody.parse(req.body);
    const config = (event.config ?? {}) as Record<string, unknown>;
    const designs = { ...eventDesigns(config) };
    if (design) designs[type] = design; else delete designs[type];
    await prisma.event.update({ where: { id: event.id }, data: { config: { ...config, certificateDesigns: designs } as Prisma.InputJsonValue } });
    await logActivity(event.id, req.auth!.user.id, "certificates.design", { type, custom: !!design });
    return designs;
  });

  /** A sample certificate (made-up name) with the saved design, for an event or for the brand. Nothing is stored. */
  app.get("/certificate-designs/preview.pdf", async (req, reply) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const q = z.object({ type: designBody.shape.type.exclude(["ALL"]).default("PARTICIPATION"), eventId: z.string().optional() }).parse(req.query);
    const event = q.eventId
      ? await requireEventManager(req, q.eventId)
      : ({ id: "sample", tenantId: tenant.id, title: "Sample Event 2026", startsAt: new Date(), endsAt: new Date(), config: {} } as never);
    const winnerish = ["WINNER", "RUNNER_UP", "SPECIAL_MENTION", "FINALIST"].includes(q.type);
    const cert = {
      id: "preview", serial: "SAMPLE-0001", type: q.type, recipientName: "Aarav Sharma",
      detail: winnerish ? `${q.type === "FINALIST" ? "Finalist" : q.type === "WINNER" ? "First place" : q.type === "RUNNER_UP" ? "1st runner-up" : "Special mention"} — Team Byte Brigade` : null,
      issuedAt: new Date(), revokedAt: null, userId: null, guestId: null, pdfUrl: null, eventId: event.id,
      event: { ...event, tenant: await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } }) },
    };
    const pdf = await renderCertificatePdf(cert as never);
    return reply.type("application/pdf").header("Content-Disposition", 'inline; filename="certificate-preview.pdf"').header("Cache-Control", "no-store").send(Buffer.from(pdf));
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
    const featured = body.postUrl ? await featureOnEventPage(post.eventId, user.id, user.name, body.postUrl) : false;
    return { ...updated, shareUrl: shareUrl(updated.draft), featured };
  });
}
