import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma";
import { notFound } from "../lib/errors";
import { brandBaseUrl } from "../lib/brand";
import { fmtDate, renderEmailHtml } from "../lib/notify";

/**
 * Development-only helpers (not registered when NODE_ENV=production).
 *   GET /v1/dev/email-preview                      → list of templates
 *   GET /v1/dev/email-preview/:template?brand=slug → HTML of a sample email for that brand
 * Optional ?base=http://altaschool.localhost:3000 overrides the brand URL used for links and the logo.
 */

interface Sample { subject: string; body: string; ctaLabel?: string; ctaUrl?: string }

function samples(e: { title: string; startsAt: Date; venue: string | null }, base: string, apiBase: string): Record<string, Sample> {
  const page = `${base}/events/sample`;
  const when = `When: ${fmtDate(e.startsAt)}${e.venue ? `\nVenue: ${e.venue}` : ""}`;
  return {
    "registration.confirmed": {
      subject: `You're registered: ${e.title}`,
      body: `Hi Aarav Sharma,\n\nYour seat for ${e.title} is confirmed.\n\n${when}\n\nYour ticket code: ELV-T-4K9Q\nShow the QR code from your ticket page (${base}/me) at the entrance.\n\nAdd it to your calendar: ${apiBase}/v1/events/sample/calendar.ics`,
      ctaLabel: "View my ticket", ctaUrl: `${base}/me`,
    },
    "registration.waitlisted": {
      subject: `You're on the waitlist: ${e.title}`,
      body: `Hi Aarav Sharma,\n\nThe event is full right now, so you're on the waitlist for ${e.title}. We'll email you as soon as a seat opens up.\n\n${when}`,
      ctaLabel: "View event", ctaUrl: page,
    },
    "certificate.ready": {
      subject: `Your certificate for ${e.title}`,
      body: `Hi Aarav Sharma,\n\nYour certificate for ${e.title} is ready.\n\nDownload (PDF): ${apiBase}/v1/certificates/ELV-SAMPLE.pdf\nVerification link: ${base}/verify/ELV-SAMPLE\n\nYou can add it to your LinkedIn profile from your account page.`,
      ctaLabel: "Download certificate", ctaUrl: `${apiBase}/v1/certificates/ELV-SAMPLE.pdf`,
    },
    "payment.receipt": {
      subject: `Payment received: ${e.title}`,
      body: `Hi Aarav Sharma,\n\nWe've received your payment of ₹299.00 for ${e.title}. Thank you!\n\nReceipt no.: ELV-2026-000100\nPayment id: pay_sample\n\nDownload your receipt (PDF): ${apiBase}/v1/payments/sample/receipt.pdf`,
      ctaLabel: "Download receipt", ctaUrl: `${apiBase}/v1/payments/sample/receipt.pdf`,
    },
    "event.cancelled": {
      subject: `Cancelled: ${e.title}`,
      body: `Hi Aarav Sharma,\n\nWe're sorry — ${e.title}, planned for ${fmtDate(e.startsAt)}, has been cancelled. Your registration has been closed and there's nothing you need to do.`,
      ctaLabel: "View event", ctaUrl: page,
    },
    "guest.invite": {
      subject: `Invitation: ${e.title}`,
      body: `Dear Dr. Kavita Menon,\n\nWe would be honoured to have you as speaker at ${e.title} on ${fmtDate(e.startsAt)}.\n\nTo help us prepare, please share your photo, a short bio, your talk title and travel details on your guest page:\n${base}/guest/sample`,
      ctaLabel: "Open my guest page", ctaUrl: `${base}/guest/sample`,
    },
    "results.published": {
      subject: `Congratulations! Team Debug Thugs won at ${e.title}`,
      body: `Hi Isha Nair,\n\nCongratulations — your team Debug Thugs won at ${e.title}! Your certificate will be on your account page soon.`,
      ctaLabel: "See results", ctaUrl: `${page}#results`,
    },
    announcement: {
      subject: `${e.title}: Venue change`,
      body: `We've moved to the main auditorium to fit everyone in.\n\nDoors open 30 minutes before the start — bring your ticket QR code.`,
      ctaLabel: "View event", ctaUrl: page,
    },
  };
}

export function devRoutes(app: FastifyInstance) {
  if (process.env.NODE_ENV === "production") return;

  app.get<{ Params: { template?: string }; Querystring: { brand?: string; base?: string } }>(
    "/dev/email-preview/:template?",
    async (req, reply) => {
      const slug = req.query.brand?.toLowerCase();
      const tenant = slug
        ? await prisma.tenant.findUnique({ where: { slug }, include: { domains: true } })
        : req.tenant
          ? await prisma.tenant.findUnique({ where: { id: req.tenant.id }, include: { domains: true } })
          : await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, include: { domains: true } });
      if (!tenant) throw notFound("Brand");

      // Prefer the local dev web app so the logo loads when previewing on this machine.
      const local = tenant.domains.find((d) => d.hostname.endsWith(".localhost"));
      const base = (req.query.base ?? (local ? `http://${local.hostname}:3000` : await brandBaseUrl(tenant.id))).replace(/\/$/, "");
      const apiBase = `${req.protocol}://${req.headers.host ?? "localhost:4000"}`;
      const event =
        (await prisma.event.findFirst({ where: { tenantId: tenant.id }, orderBy: { startsAt: "desc" } })) ??
        { title: "Sample Event", startsAt: new Date(), venue: "Main Auditorium" };
      const all = samples(event, base, apiBase);

      if (!req.params.template) {
        const q = `?brand=${encodeURIComponent(tenant.slug)}${req.query.base ? `&base=${encodeURIComponent(req.query.base)}` : ""}`;
        const items = Object.keys(all).map((k) => `<li><a href="/v1/dev/email-preview/${k}${q}">${k}</a></li>`).join("");
        return reply.type("text/html").send(`<!doctype html><title>Email previews</title><body style="font-family:system-ui;padding:24px"><h1>Email previews: ${tenant.name}</h1><ul>${items}</ul></body>`);
      }
      const s = all[req.params.template];
      if (!s) throw notFound(`Email template "${req.params.template}" (try: ${Object.keys(all).join(", ")})`);
      const html = await renderEmailHtml(tenant, s.subject, s.body, { label: s.ctaLabel, url: s.ctaUrl }, { baseUrl: base });
      return reply.type("text/html; charset=utf-8").send(html);
    },
  );
}
