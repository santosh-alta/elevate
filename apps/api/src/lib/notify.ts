import type { Notification, NotificationChannel, Prisma, Tenant } from "@prisma/client";
import { Prisma as P } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { formatMoney } from "@elevate/shared";
import { apiBaseUrl, brandBaseUrl, settingsOf, themeOf, verifyUrl } from "./brand";
import { receiptUrl as receiptLink } from "./receipt";

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
            data: { ...(input.data ?? {}), ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl } as Prisma.InputJsonValue,
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

/** Brand-themed HTML from the plain-text body (paragraphs split on blank lines, URLs linked). */
export function renderEmailHtml(tenant: Tenant, subject: string, body: string, cta?: { label?: string; url?: string }): string {
  const theme = themeOf(tenant);
  const c = theme.colors;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => esc(p).replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${c.primary}">$1</a>`).replace(/\n/g, "<br>"))
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p}</p>`)
    .join("");
  const button =
    cta?.url && cta.label
      ? `<p style="margin:22px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:${c.primary};color:${c.primaryFg};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:${theme.radius ?? 10}px">${esc(cta.label)}</a></p>`
      : "";
  const logo = theme.logoUrl ? `<img src="${esc(theme.logoUrl)}" alt="" height="28" style="vertical-align:middle;margin-right:10px">` : "";
  return `<!doctype html><html><body style="margin:0;background:${c.bg};font-family:${theme.font ?? "Inter"},Arial,sans-serif;color:${c.fg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${c.card};border:1px solid ${c.border};border-radius:12px;overflow:hidden">
<tr><td style="background:${c.primary};color:${c.primaryFg};padding:18px 24px;font-weight:700;font-size:16px">${logo}${esc(tenant.name)}</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:20px">${esc(subject)}</h1>${paragraphs}${button}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid ${c.border};color:${c.muted};font-size:12px">Sent by ${esc(tenant.name)} · Powered by Elevate</td></tr>
</table></td></tr></table></body></html>`;
}

export function fromAddress(tenant: Tenant): string {
  const settings = settingsOf(tenant);
  if (settings.emailFrom) return settings.emailFrom;
  const fallback = process.env.MAIL_FROM ?? "Elevate <no-reply@elevate.app>";
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
  const statuses =
    template === "feedback.request" ? (modules.checkin === false ? [...ACTIVE_REG] : ["CHECKED_IN"]) : [...ACTIVE_REG, "WAITLISTED"];
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
      body = `Hi ${r.user.name},\n\nThank you for attending ${e.title}. Tell us how it went — it takes under a minute and helps us make the next one better.`;
      ctaLabel = "Give feedback";
      ctaUrl = `${links.me}#feedback`;
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
