import type { Notification, NotificationChannel, Prisma, Tenant } from "@prisma/client";
import { Prisma as P } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { formatMoney } from "@elevate/shared";
import { apiBaseUrl, brandBaseUrl, settingsOf, themeOf, verifyUrl } from "./brand";
import { receiptUrl as receiptLink } from "./receipt";
import { absoluteAssetUrl } from "./brandAssets";

/**
 * Notification outbox. Every message is a Notification row; src/worker.ts sends due EMAIL rows.
 * IN_APP rows are stored as SENT straight away (the app lists them).
 * A dedupKey (suffixed per channel) makes automatic messages idempotent.
 */

export interface EnqueueInput {
  tenantId: string;
  eventId?: string | null;
  userId?: string | null;
  toEmail?: string | null;
  channels: NotificationChannel[];
  template: string;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  data?: Record<string, unknown>;
  scheduledFor?: Date;
  dedupKey?: string;
  /** Extra recipients copied on the email (e.g. team leads) */
  cc?: string[];
}

export async function enqueue(input: EnqueueInput): Promise<Notification[]> {
  let email = input.toEmail?.toLowerCase() ?? null;
  if (!email && input.userId && input.channels.includes("EMAIL")) {
    email = (await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }))?.email ?? null;
  }
  const created: Notification[] = [];
  for (const channel of input.channels) {
    if (channel === "EMAIL" && !email) continue;
    if (channel === "IN_APP" && !input.userId) continue;
    if (channel === "PUSH" || channel === "WHATSAPP") continue; // not wired yet (phase 2/3)
    const inApp = channel === "IN_APP";
    try {
      created.push(
        await prisma.notification.create({
          data: {
            tenantId: input.tenantId,
            eventId: input.eventId ?? null,
            userId: input.userId ?? null,
            toEmail: channel === "EMAIL" ? email : null,
            channel,
            template: input.template,
            subject: input.subject,
            body: input.body,
            data: {
              ...(input.data ?? {}), ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl,
              ...(channel === "EMAIL" && input.cc?.length && { cc: input.cc.filter((c) => c.toLowerCase() !== email) }),
            } as Prisma.InputJsonValue,
            scheduledFor: input.scheduledFor ?? new Date(),
            dedupKey: input.dedupKey ? `${input.dedupKey}:${channel}` : null,
            ...(inApp && { status: "SENT", sentAt: new Date() }),
          },
        }),
      );
    } catch (err) {
      // Duplicate dedupKey = already queued earlier; anything else is a real error.
      if (!(err instanceof P.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return created;
}

/** Never lets a notification problem break the main action. */
export function safely(label: string, fn: () => Promise<unknown>): void {
  if (process.env.ELEVATE_SEEDING === "1") return; // demo data shouldn't send mail
  void fn().catch((err) => console.error(`[notify] ${label} failed`, err));
}

// ───────── Formatting ─────────

const DISPLAY_TZ = process.env.DISPLAY_TZ ?? "Asia/Kolkata";

export function fmtDate(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: DISPLAY_TZ, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", twitter: "X", youtube: "YouTube",
};

export interface EmailRenderOptions {
  /** Public web URL of the brand (links and relative logo URLs). Defaults to brandBaseUrl(tenant.id). */
  baseUrl?: string;
}

/**
 * Brand-themed HTML email (table-based, 600px, inline styles) from the plain-text body:
 * hero-coloured header with the logo, white body, CTA in the brand's secondary colour,
 * hero-coloured footer with website / phone / email / social links and a manage-notifications link.
 */
export async function renderEmailHtml(
  tenant: Tenant,
  subject: string,
  body: string,
  cta?: { label?: string; url?: string },
  opts: EmailRenderOptions = {},
): Promise<string> {
  const theme = themeOf(tenant);
  const settings = settingsOf(tenant);
  const c = theme.colors;
  const base = (opts.baseUrl ?? (await brandBaseUrl(tenant.id))).replace(/\/$/, "");
  const [g1, g2] = theme.gradient ?? [c.primary, c.accent];
  const font = `${theme.font ? `'${theme.font}',` : ""}Helvetica,Arial,sans-serif`;
  const headingFont = `${theme.headingFont ? `'${theme.headingFont}',` : ""}${font}`;
  const radius = Math.min(theme.radius ?? 10, 24);

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => esc(p).replace(/https?:\/\/[^\s<]+/g, (m) => {
      // Leave trailing punctuation such as ")" "." "," outside the link.
      const url = m.replace(/[).,;:!?]+$/, "");
      return `<a href="${url}" style="color:${c.accent};text-decoration:underline;word-break:break-all">${url}</a>${m.slice(url.length)}`;
    }).replace(/\n/g, "<br>"))
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${c.muted}">${p}</p>`)
    .join("\n");

  const button =
    cta?.url && cta.label
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px"><tr>
<td align="center" bgcolor="${c.secondary}" style="border-radius:${radius}px;background:${c.secondary}">
<a href="${esc(cta.url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${font};font-size:14px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${c.secondaryFg};text-decoration:none;border-radius:${radius}px">${esc(cta.label)}</a>
</td></tr></table>`
      : "";

  const logoUrl = absoluteAssetUrl(theme.logoDarkUrl ?? theme.logoUrl, base);
  const brandMark = logoUrl
    ? `<a href="${esc(base)}" target="_blank" style="text-decoration:none"><img src="${esc(logoUrl)}" width="140" alt="${esc(tenant.name)}" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;color:${c.heroFg};font-family:${font};font-size:18px;font-weight:700"></a>`
    : `<a href="${esc(base)}" target="_blank" style="font-family:${headingFont};font-size:20px;font-weight:700;color:${c.heroFg};text-decoration:none">${esc(tenant.name)}</a>`;

  const link = (href: string, label: string, style = "") =>
    `<a href="${esc(href)}" target="_blank" style="color:${c.heroFg};text-decoration:none;${style}">${esc(label)}</a>`;
  const website = settings.website?.trim();
  const contact = [
    settings.phone ? link(`tel:${settings.phone.replace(/[^\d+]/g, "")}`, settings.phone) : null,
    settings.supportEmail ? link(`mailto:${settings.supportEmail}`, settings.supportEmail) : null,
  ].filter(Boolean).join(`<span style="opacity:0.6">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`);
  const socials = Object.entries(settings.social ?? {})
    .filter(([k, v]) => SOCIAL_LABELS[k.toLowerCase()] && /^https?:\/\//.test(v ?? ""))
    .map(([k, v]) => link(v, SOCIAL_LABELS[k.toLowerCase()], "display:inline-block;margin:0 8px;font-weight:600"))
    .join("");
  const footerRows = [
    `<p style="margin:0 0 10px;font-size:14px;font-weight:700">${website ? link(website, website.replace(/^https?:\/\//, "").replace(/\/$/, "")) : esc(tenant.name)}</p>`,
    contact ? `<p style="margin:0 0 16px;font-size:13px">${contact}</p>` : "",
    socials ? `<p style="margin:0 0 18px;font-size:13px">${socials}</p>` : "",
    settings.address ? `<p style="margin:0 0 18px;font-size:12px;opacity:0.75">${esc(settings.address)}</p>` : "",
    theme.tagline ? `<p style="margin:0 0 18px;font-size:12px;opacity:0.75">${esc(theme.tagline)}</p>` : "",
    `<p style="margin:0 0 6px;font-size:12px;opacity:0.75">You're receiving this because you have an account or event registration with ${esc(tenant.name)}.</p>`,
    `<p style="margin:0;font-size:12px">${link(`${base}/me#notifications`, "Unsubscribe or manage notifications", "text-decoration:underline")}</p>`,
  ].join("\n");

  const preheader = esc(body.replace(/\s+/g, " ").slice(0, 140));
  const fontLink = theme.fontCssUrl
    ? `<link href="${esc(theme.fontCssUrl)}" rel="stylesheet">`
    : theme.font
      ? `<link href="https://fonts.googleapis.com/css2?family=${[...new Set([theme.font, theme.headingFont].filter(Boolean))].map((f) => encodeURIComponent(f!).replace(/%20/g, "+") + ":wght@400;600;700").join("&family=")}&display=swap" rel="stylesheet">`
      : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
${fontLink}
<style>@media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${c.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.bg}" style="background:${c.bg}"><tr><td align="center" style="padding:24px 8px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${font}">
<tr><td align="center" valign="middle" height="90" bgcolor="${c.heroBg}" style="height:90px;background:${c.heroBg};padding:0 24px">${brandMark}</td></tr>
<tr><td height="4" bgcolor="${g1}" style="height:4px;line-height:4px;font-size:0;background:${g1};background-image:linear-gradient(90deg,${g1},${g2})">&nbsp;</td></tr>
<tr><td class="px" bgcolor="${c.card}" style="background:${c.card};padding:40px 48px 36px">
<h1 style="margin:0 0 20px;font-family:${headingFont};font-size:24px;line-height:1.3;font-weight:700;color:${c.fg}">${esc(subject)}</h1>
${paragraphs}
${button}
</td></tr>
<tr><td height="3" bgcolor="${c.accent}" style="height:3px;line-height:3px;font-size:0;background:${c.accent}">&nbsp;</td></tr>
<tr><td class="px" align="center" valign="middle" height="200" bgcolor="${c.heroBg}" style="height:200px;background:${c.heroBg};color:${c.heroFg};padding:36px 48px;font-family:${font};text-align:center">
${footerRows}
</td></tr>
<tr><td align="center" style="padding:16px 0 0;font-family:${font};font-size:11px;color:${c.muted}">${esc(tenant.name)} · You're receiving this as a student or event participant.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function fromAddress(tenant: Tenant): string {
  const settings = settingsOf(tenant);
  if (settings.emailFrom) return settings.emailFrom;
  const fallback = process.env.MAIL_FROM ?? "Events <no-reply@localhost>";
  const addr = /<([^>]+)>/.exec(fallback)?.[1] ?? fallback;
  return `${tenant.name.replace(/[<>"]/g, "")} <${addr}>`;
}

// ───────── Links ─────────

export async function eventLinks(event: { id: string; tenantId: string; slug: string }) {
  const base = await brandBaseUrl(event.tenantId);
  return {
    page: `${base}/events/${event.slug}`,
    me: `${base}/me`,
    // The API resolves events by id without a brand host, so this link works from any mail client.
    ics: `${apiBaseUrl()}/v1/events/${event.id}/calendar.ics`,
    base,
  };
}

// ───────── Automatic messages ─────────

const ACTIVE_REG = ["REGISTERED", "APPROVED", "CHECKED_IN"] as const;

function where(event: { venue: string | null; meetingUrl: string | null; mode: string }): string {
  const parts: string[] = [];
  if (event.mode !== "ONLINE" && event.venue) parts.push(`Venue: ${event.venue}`);
  if (event.mode !== "OFFLINE" && event.meetingUrl) parts.push(`Join online: ${event.meetingUrl}`);
  return parts.join("\n");
}

export async function notifyRegistration(registrationId: string, kind: "confirmed" | "waitlisted" | "approved"): Promise<void> {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId }, include: { event: true, user: true } });
  if (!reg) return;
  const e = reg.event;
  const links = await eventLinks(e);
  const pending = kind === "confirmed" && reg.status === "REGISTERED" && e.requiresApproval;
  const subject =
    kind === "waitlisted" ? `You're on the waitlist: ${e.title}`
      : kind === "approved" ? `You're in! ${e.title}`
        : pending ? `Registration received: ${e.title}` : `You're registered: ${e.title}`;
  const lines = [
    `Hi ${reg.user.name},`,
    kind === "waitlisted"
      ? `The event is full right now, so you're on the waitlist for ${e.title}. We'll email you as soon as a seat opens up.`
      : pending
        ? `We've received your registration for ${e.title}. The organisers will review it and confirm soon.`
        : `Your seat for ${e.title} is confirmed.`,
    `When: ${fmtDate(e.startsAt)}\n${where(e)}`.trim(),
  ];
  if (kind !== "waitlisted" && !pending) {
    lines.push(`Your ticket code: ${reg.ticketCode}\nShow the QR code from your ticket page (${links.me}) at the entrance.`);
    lines.push(`Add it to your calendar: ${links.ics}`);
  }
  await enqueue({
    tenantId: e.tenantId, eventId: e.id, userId: reg.userId, channels: ["EMAIL", "IN_APP"],
    template: `registration.${kind}`, subject, body: lines.join("\n\n"),
    ctaLabel: kind === "waitlisted" || pending ? "View event" : "View my ticket", ctaUrl: kind === "waitlisted" || pending ? links.page : links.me,
    data: { registrationId: reg.id },
  });
}

/** Sends a message to everyone actively registered for an event. */
export async function notifyAudience(
  eventId: string,
  template: "event.cancelled" | "event.updated" | "feedback.request",
  opts: { changes?: string[]; dedupSuffix?: string } = {},
): Promise<number> {
  const e = await prisma.event.findUnique({ where: { id: eventId } });
  if (!e) return 0;
  const modules = (e.modules ?? {}) as Record<string, boolean>;
  // Feedback goes to people who checked in; if attendance wasn't taken, to everyone registered.
  const checkedIn = template === "feedback.request" ? await prisma.registration.count({ where: { eventId, status: "CHECKED_IN" } }) : 0;
  const statuses =
    template === "feedback.request" ? (modules.checkin === false || !checkedIn ? [...ACTIVE_REG, "CHECKED_IN"] : ["CHECKED_IN"]) : [...ACTIVE_REG, "WAITLISTED"];
  const regs = await prisma.registration.findMany({
    where: { eventId, status: { in: statuses as never[] } },
    include: { user: { select: { id: true, name: true } } },
  });
  const links = await eventLinks(e);
  for (const r of regs) {
    let subject: string;
    let body: string;
    let ctaLabel = "View event";
    let ctaUrl = links.page;
    if (template === "event.cancelled") {
      subject = `Cancelled: ${e.title}`;
      body = `Hi ${r.user.name},\n\nWe're sorry — ${e.title}, planned for ${fmtDate(e.startsAt)}, has been cancelled. Your registration has been closed and there's nothing you need to do.`;
    } else if (template === "event.updated") {
      subject = `Updated details: ${e.title}`;
      body = `Hi ${r.user.name},\n\nSome details of ${e.title} have changed:\n${(opts.changes ?? []).map((c) => `• ${c}`).join("\n")}\n\nWhen: ${fmtDate(e.startsAt)}\n${where(e)}`.trim();
    } else {
      subject = `How was ${e.title}?`;
      body = `Hi ${r.user.name.split(" ")[0]},\n\nThank you for being part of ${e.title}. How was it? Rate the content, speakers and organisation, and tell us what to improve. It takes under a minute and shapes the next one.`;
      ctaLabel = "Give feedback";
      ctaUrl = `${links.page}/feedback`;
    }
    await enqueue({
      tenantId: e.tenantId, eventId: e.id, userId: r.user.id, channels: ["EMAIL", "IN_APP"], template, subject, body, ctaLabel, ctaUrl,
      dedupKey: `${template}:${r.id}${opts.dedupSuffix ? `:${opts.dedupSuffix}` : ""}`,
    });
  }
  return regs.length;
}

export async function notifyCertificate(certificateId: string): Promise<void> {
  const cert = await prisma.certificate.findUnique({ where: { id: certificateId }, include: { event: true, user: true, guest: true } });
  if (!cert || cert.revokedAt) return;
  const base = await brandBaseUrl(cert.event.tenantId);
  const verify = verifyUrl(base, cert.serial);
  const pdf = `${apiBaseUrl()}/v1/certificates/${cert.serial}.pdf`;
  await enqueue({
    tenantId: cert.event.tenantId, eventId: cert.eventId, userId: cert.userId, toEmail: cert.user?.email ?? cert.guest?.email,
    channels: ["EMAIL", "IN_APP"], template: "certificate.ready",
    subject: `Your certificate for ${cert.event.title}`,
    body: `Hi ${cert.recipientName},\n\nYour certificate for ${cert.event.title} is ready.\n\nDownload (PDF): ${pdf}\nVerification link: ${verify}\n\nYou can add it to your LinkedIn profile from your account page.`,
    ctaLabel: "Download certificate", ctaUrl: pdf, dedupKey: `certificate.ready:${cert.id}`, data: { certificateId: cert.id },
  });
}

export async function notifyLinkedInReady(eventId: string, userId: string): Promise<void> {
  const e = await prisma.event.findUnique({ where: { id: eventId } });
  if (!e) return;
  const links = await eventLinks(e);
  await enqueue({
    tenantId: e.tenantId, eventId, userId, channels: ["EMAIL", "IN_APP"], template: "linkedin.ready",
    subject: `Share your ${e.title} experience on LinkedIn`,
    body: `We've drafted a LinkedIn post about your time at ${e.title}. Review it, make it yours, and share it in one tap.`,
    ctaLabel: "Review my post", ctaUrl: `${links.me}#linkedin`, dedupKey: `linkedin.ready:${eventId}:${userId}`,
  });
}

export async function notifyGuest(guestId: string, template: "guest.invite" | "guest.thank_you" | "guest.reminder"): Promise<Notification[]> {
  const g = await prisma.eventGuest.findUnique({ where: { id: guestId }, include: { event: true, host: true, certificates: true } });
  if (!g?.email) return [];
  const e = g.event;
  const links = await eventLinks(e);
  const portal = `${links.base}/guest/${g.portalToken}`;
  const host = g.host ? `\n\nYour point of contact: ${g.host.name}${g.host.phone ? `, ${g.host.phone}` : ""} (${g.host.email})` : "";
  let subject: string;
  let body: string;
  let ctaLabel = "Open my guest page";
  let ctaUrl = portal;
  let dedupKey: string | undefined;
  if (template === "guest.invite") {
    subject = `Invitation: ${e.title}`;
    body = `Dear ${g.name},\n\nWe would be honoured to have you as ${g.role.toLowerCase().replace(/_/g, " ")} at ${e.title} on ${fmtDate(e.startsAt)}.${e.venue ? `\nVenue: ${e.venue}` : ""}\n\nTo help us prepare, please share your photo, a short bio, your talk title and travel details on your guest page:\n${portal}${host}`;
  } else if (template === "guest.reminder") {
    subject = `Reminder: your details for ${e.title}`;
    body = `Dear ${g.name},\n\nWe're looking forward to welcoming you on ${fmtDate(e.startsAt)}. We still need your photo, bio and travel details — it only takes a few minutes:\n${portal}${host}`;
    dedupKey = `guest.reminder:${g.id}`;
  } else {
    const cert = g.certificates.find((c) => !c.revokedAt);
    subject = `Thank you for being part of ${e.title}`;
    body = `Dear ${g.name},\n\nThank you for joining us at ${e.title}. Our students and team truly valued your time and insights.`;
    if (cert) {
      const pdf = `${apiBaseUrl()}/v1/certificates/${cert.serial}.pdf`;
      body += `\n\nPlease find your certificate of appreciation here: ${pdf}`;
      ctaLabel = "Download certificate";
      ctaUrl = pdf;
    } else {
      ctaLabel = "View event";
      ctaUrl = links.page;
    }
  }
  return enqueue({
    tenantId: e.tenantId, eventId: e.id, toEmail: g.email, channels: ["EMAIL"], template, subject, body, ctaLabel, ctaUrl, dedupKey,
    data: { guestId: g.id },
  });
}

/** Fans an announcement out to registrants on its EMAIL / IN_APP channels. Idempotent per recipient. */
export async function fanOutAnnouncement(announcementId: string): Promise<number> {
  const a = await prisma.announcement.findUnique({ where: { id: announcementId }, include: { event: true } });
  if (!a) return 0;
  const channels = a.channels.filter((c): c is NotificationChannel => c === "EMAIL" || c === "IN_APP");
  if (!channels.length) return 0;
  const regs = await prisma.registration.findMany({
    where: { eventId: a.eventId, status: { in: [...ACTIVE_REG, "WAITLISTED"] } },
    select: { id: true, userId: true },
  });
  const links = await eventLinks(a.event);
  for (const r of regs) {
    await enqueue({
      tenantId: a.event.tenantId, eventId: a.eventId, userId: r.userId, channels, template: "announcement",
      subject: `${a.event.title}: ${a.title}`, body: a.body, ctaLabel: "View event", ctaUrl: links.page,
      dedupKey: `announcement:${a.id}:${r.id}`, data: { announcementId: a.id },
    });
  }
  await prisma.announcement.update({ where: { id: a.id }, data: { sentAt: new Date() } });
  return regs.length;
}

// ───────── v1.2: teams, payments, judging, results, gallery ─────────

/** A team leader registered this person: "<leader> added you to team <name> for <event>". */
export async function notifyTeamAdded(registrationId: string): Promise<void> {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId }, include: { event: true, user: true } });
  if (!reg) return;
  const e = reg.event;
  const [leader, tm] = await Promise.all([
    reg.addedById ? prisma.user.findUnique({ where: { id: reg.addedById } }) : null,
    prisma.teamMember.findFirst({ where: { userId: reg.userId, team: { eventId: e.id } }, include: { team: true } }),
  ]);
  const links = await eventLinks(e);
  const teamName = tm?.team.name ?? "their team";
  const who = leader?.name ?? "Your team leader";
  const lines = [
    `Hi ${reg.user.name},`,
    `${who} added you to team ${teamName} for ${e.title}.`,
    `When: ${fmtDate(e.startsAt)}\n${where(e)}`.trim(),
  ];
  if (["APPROVED", "CHECKED_IN"].includes(reg.status)) {
    lines.push(`Your ticket code: ${reg.ticketCode}\nYour ticket and team are on your account page: ${links.me}`);
  } else if (reg.status === "REGISTERED") {
    lines.push("The organisers will review the registration and confirm soon.");
  }
  lines.push(`Not you, or don't want to take part? You can leave the team from the event page: ${links.page}`);
  await enqueue({
    tenantId: e.tenantId, eventId: e.id, userId: reg.userId, channels: ["EMAIL", "IN_APP"], template: "team.added",
    subject: `${who} added you to team ${teamName}: ${e.title}`, body: lines.join("\n\n"),
    ctaLabel: "View my ticket", ctaUrl: links.me, dedupKey: `team.added:${reg.id}:${reg.status}`,
    data: { registrationId: reg.id, teamId: tm?.teamId },
  });
}

export async function notifyPayment(paymentId: string, kind: "receipt" | "failed" | "expired"): Promise<void> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { event: true, user: true, coupon: true, team: true } });
  if (!p) return;
  const e = p.event;
  const links = await eventLinks(e);
  const amount = formatMoney(p.amount, p.currency);
  const receiptUrl = receiptLink(p.id);
  let subject: string;
  let body: string;
  let ctaLabel = "View event";
  let ctaUrl = links.page;
  if (kind === "receipt") {
    subject = `Payment received: ${e.title}`;
    body = [
      `Hi ${p.user.name},`,
      `We've received your payment of ${amount} for ${e.title}${p.team ? ` (team ${p.team.name})` : ""}. Thank you!`,
      [`Receipt no.: ${p.receiptNo}`, p.quantity > 1 ? `Seats: ${p.quantity}` : null, p.coupon ? `Coupon: ${p.coupon.code} (−${formatMoney(p.discount, p.currency)})` : null,
        p.providerPaymentId ? `Payment id: ${p.providerPaymentId}` : null].filter(Boolean).join("\n"),
      `Download your receipt (PDF): ${receiptUrl}`,
    ].join("\n\n");
    ctaLabel = "Download receipt";
    ctaUrl = receiptUrl;
  } else if (kind === "failed") {
    subject = `Payment failed: ${e.title}`;
    body = `Hi ${p.user.name},\n\nYour payment of ${amount} for ${e.title} didn't go through, so your registration isn't confirmed yet. No money was taken — if it was, it will be refunded automatically by your bank.\n\nYou can try again from the event page.`;
    ctaLabel = "Try again";
  } else {
    subject = `Registration not completed: ${e.title}`;
    body = `Hi ${p.user.name},\n\nWe held your seat${p.quantity > 1 ? "s" : ""} for ${e.title} for 30 minutes, but the payment of ${amount} wasn't completed, so the registration has been released.\n\nIf you still want to join, you can register again from the event page while seats last.`;
    ctaLabel = "Register again";
  }
  await enqueue({
    tenantId: e.tenantId, eventId: e.id, userId: p.userId, channels: ["EMAIL", "IN_APP"], template: `payment.${kind}`,
    subject, body, ctaLabel, ctaUrl, dedupKey: `payment.${kind}:${p.id}${kind === "failed" ? `:${p.updatedAt.getTime()}` : ""}`,
    data: { paymentId: p.id },
  });
}

/** Results are out: every team member gets an email (winners get a congratulations). */
export async function notifyResults(eventId: string, publishedAt: Date): Promise<number> {
  const e = await prisma.event.findUnique({ where: { id: eventId } });
  if (!e) return 0;
  const teams = await prisma.team.findMany({ where: { eventId }, include: { members: { include: { user: true } } } });
  const links = await eventLinks(e);
  const label: Record<string, string> = { WINNER: "won", RUNNER_UP: "finished 1st runner-up", SECOND_RUNNER_UP: "finished 2nd runner-up", SPECIAL_MENTION: "received a special mention" };
  let n = 0;
  for (const t of teams) {
    for (const m of t.members) {
      const won = t.award ? label[t.award] : null;
      await enqueue({
        tenantId: e.tenantId, eventId, userId: m.userId, channels: ["EMAIL", "IN_APP"], template: "results.published",
        subject: won ? `Congratulations! Team ${t.name} ${won} at ${e.title}` : `Results are out: ${e.title}`,
        body: won
          ? `Hi ${m.user.name},\n\nCongratulations — your team ${t.name} ${won} at ${e.title}! Your certificate will be on your account page soon.`
          : `Hi ${m.user.name},\n\nThe results of ${e.title} are out. Thank you for building with us — see the winners and every team's work on the event page.`,
        ctaLabel: "See results", ctaUrl: `${links.page}#results`,
        dedupKey: `results.published:${eventId}:${m.userId}:${publishedAt.getTime()}`,
      });
      n++;
    }
  }
  return n;
}

/** A judging round was opened: tell the event's judges. */
export async function notifyRoundOpened(roundId: string): Promise<number> {
  const round = await prisma.judgingRound.findUnique({ where: { id: roundId }, include: { event: true } });
  if (!round) return 0;
  const e = round.event;
  const judges = await prisma.judgeAssignment.findMany({
    where: { eventId: e.id, OR: [{ roundId }, { roundId: null }] },
    distinct: ["userId"],
    include: { user: true },
  });
  const links = await eventLinks(e);
  const stamp = Date.now();
  for (const j of judges) {
    await enqueue({
      tenantId: e.tenantId, eventId: e.id, userId: j.userId, channels: ["EMAIL", "IN_APP"], template: "round.opened",
      subject: `Judging is open: ${round.name} — ${e.title}`,
      body: `Hi ${j.user.name},\n\n${round.name} of ${e.title} is now open for judging.${round.closesAt ? ` Please submit your scores by ${fmtDate(round.closesAt)}.` : ""}${round.description ? `\n\n${round.description}` : ""}\n\nOpen the judge view to see your teams, their submissions and the scoring criteria.`,
      ctaLabel: "Start judging", ctaUrl: `${links.base}/judge/${e.id}`,
      dedupKey: `round.opened:${roundId}:${j.userId}:${stamp}`, data: { roundId },
    });
  }
  return judges.length;
}

/** Photos are up: everyone who attended. */
export async function notifyGallery(eventId: string): Promise<number> {
  const e = await prisma.event.findUnique({ where: { id: eventId } });
  if (!e) return 0;
  const modules = (e.modules ?? {}) as Record<string, boolean>;
  const statuses = modules.checkin === false || e.mode === "ONLINE" ? [...ACTIVE_REG] : ["CHECKED_IN"];
  const regs = await prisma.registration.findMany({
    where: { eventId, status: { in: statuses as never[] } },
    include: { user: { select: { id: true, name: true } } },
  });
  const links = await eventLinks(e);
  for (const r of regs) {
    await enqueue({
      tenantId: e.tenantId, eventId, userId: r.userId, channels: ["EMAIL", "IN_APP"], template: "gallery.ready",
      subject: `Photos from ${e.title} are up`,
      body: `Hi ${r.user.name},\n\nThe photos from ${e.title} are up — find yourself, download your favourites and share them.\n\nGallery: ${links.page}#gallery${e.driveFolderUrl ? `\nAll photos (Drive): ${e.driveFolderUrl}` : ""}`,
      ctaLabel: "See the photos", ctaUrl: `${links.page}#gallery`, dedupKey: `gallery.ready:${eventId}:${r.id}`,
    });
  }
  return regs.length;
}
