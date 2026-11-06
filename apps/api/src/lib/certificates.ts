import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { Certificate, CertificateType, Event, Tenant } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { brandBaseUrl, settingsOf, themeOf, verifyUrl } from "./brand";
import { certificateSerial } from "./codes";
import { notifyCertificate, safely } from "./notify";

const TITLES: Record<CertificateType, string> = {
  PARTICIPATION: "Certificate of Participation",
  WINNER: "Certificate of Excellence — Winner",
  RUNNER_UP: "Certificate of Excellence — Runner-up",
  SPECIAL_MENTION: "Certificate of Merit — Special Mention",
  JUDGE: "Certificate of Appreciation — Judge",
  SPEAKER: "Certificate of Appreciation — Speaker",
  VOLUNTEER: "Certificate of Appreciation — Volunteer",
  MENTOR: "Certificate of Appreciation — Mentor",
};

const AWARD_TO_TYPE: Record<string, CertificateType> = {
  WINNER: "WINNER",
  RUNNER_UP: "RUNNER_UP",
  SECOND_RUNNER_UP: "RUNNER_UP",
  SPECIAL_MENTION: "SPECIAL_MENTION",
};

const GUEST_ROLE_TO_TYPE: Record<string, CertificateType> = {
  SPEAKER: "SPEAKER", CHIEF_GUEST: "SPEAKER", PANELIST: "SPEAKER", MODERATOR: "SPEAKER", INVESTOR: "SPEAKER",
  JUDGE: "JUDGE", MENTOR: "MENTOR",
};

const GUEST_ROLE_LABEL: Record<string, string> = {
  CHIEF_GUEST: "Chief Guest", PANELIST: "Panelist", MODERATOR: "Moderator", INVESTOR: "Investor Panel",
};

const AWARD_LABEL: Record<string, string> = {
  WINNER: "Winner",
  RUNNER_UP: "1st Runner-up",
  SECOND_RUNNER_UP: "2nd Runner-up",
  SPECIAL_MENTION: "Special Mention",
};

interface Recipient {
  userId?: string;
  guestId?: string;
  name: string;
  type: CertificateType;
  detail?: string;
}

/**
 * Generates every certificate for an event. Idempotent: an existing certificate (same event, user, type)
 * keeps its serial; only name/detail are refreshed.
 */
export async function generateCertificates(eventId: string): Promise<{ created: number; total: number }> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const modules = (event.modules ?? {}) as Record<string, boolean>;
  const recipients: Recipient[] = [];

  // Participation: checked-in attendees (or everyone registered when check-in isn't used).
  const regs = await prisma.registration.findMany({
    where: {
      eventId,
      status: modules.checkin === false ? { in: ["REGISTERED", "APPROVED", "CHECKED_IN"] } : "CHECKED_IN",
    },
    include: { user: true },
  });
  for (const r of regs) recipients.push({ userId: r.userId, name: r.user.name, type: "PARTICIPATION" });

  // Awards from published team results.
  const awarded = await prisma.team.findMany({
    where: { eventId, award: { not: null } },
    include: { members: { include: { user: true } } },
  });
  for (const team of awarded) {
    const type = AWARD_TO_TYPE[team.award!];
    if (!type) continue;
    for (const m of team.members) {
      recipients.push({ userId: m.userId, name: m.user.name, type, detail: `${AWARD_LABEL[team.award!]} — Team ${team.name}` });
    }
  }

  // Judges.
  const judges = await prisma.judgeAssignment.findMany({ where: { eventId }, include: { user: true }, distinct: ["userId"] });
  for (const j of judges) recipients.push({ userId: j.userId, name: j.user.name, type: "JUDGE" });

  // Guests (speakers, chief guests, panelists, judges, mentors, investors) — with or without an Elevate account.
  const guests = await prisma.eventGuest.findMany({ where: { eventId, status: { in: ["CONFIRMED", "ARRIVED", "THANKED"] } } });
  if (guests.length) {
    const emails = guests.filter((g) => g.email).map((g) => g.email!.toLowerCase());
    const users = emails.length ? await prisma.user.findMany({ where: { email: { in: emails } } }) : [];
    const byEmail = new Map(users.map((u) => [u.email, u]));
    for (const g of guests) {
      const u = g.email ? byEmail.get(g.email.toLowerCase()) : undefined;
      recipients.push({
        guestId: g.id,
        userId: u?.id,
        name: g.name,
        type: GUEST_ROLE_TO_TYPE[g.role] ?? "SPEAKER",
        detail: [GUEST_ROLE_LABEL[g.role], g.talkTitle ? `"${g.talkTitle}"` : null].filter(Boolean).join(" — ") || undefined,
      });
    }
  }

  // Volunteers and mentors.
  const staff = await prisma.eventStaff.findMany({ where: { eventId, role: { in: ["VOLUNTEER", "MENTOR"] } }, include: { user: true } });
  for (const s of staff) recipients.push({ userId: s.userId, name: s.user.name, type: s.role === "MENTOR" ? "MENTOR" : "VOLUNTEER" });

  // A judge who is also listed as a guest gets one JUDGE certificate (the guest's), not two.
  const guestUserTypes = new Set(recipients.filter((r) => r.guestId && r.userId).map((r) => `${r.userId}:${r.type}`));
  const finalRecipients = recipients.filter((r) => r.guestId || !guestUserTypes.has(`${r.userId}:${r.type}`));

  let created = 0;
  for (const r of finalRecipients) {
    const existing =
      (r.guestId && (await prisma.certificate.findUnique({ where: { eventId_guestId_type: { eventId, guestId: r.guestId, type: r.type } } }))) ||
      (r.userId && (await prisma.certificate.findUnique({ where: { eventId_userId_type: { eventId, userId: r.userId, type: r.type } } }))) ||
      null;
    if (existing) {
      const patch = {
        ...(existing.recipientName !== r.name && { recipientName: r.name }),
        ...(existing.detail !== (r.detail ?? null) && { detail: r.detail ?? null }),
        ...(r.guestId && !existing.guestId && { guestId: r.guestId }),
        ...(r.userId && !existing.userId && { userId: r.userId }),
      };
      if (Object.keys(patch).length) await prisma.certificate.update({ where: { id: existing.id }, data: patch });
      continue;
    }
    const cert = await prisma.certificate.create({
      data: {
        eventId, userId: r.userId ?? null, guestId: r.guestId ?? null, type: r.type,
        recipientName: r.name, detail: r.detail, serial: certificateSerial(),
      },
    });
    safely("certificate.ready", () => notifyCertificate(cert.id));
    created++;
  }
  const total = await prisma.certificate.count({ where: { eventId, revokedAt: null } });
  return { created, total };
}

function hexToRgb(hex: string, fallback: RGB = rgb(0.3, 0.27, 0.9)): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** WinAnsi-safe text for the standard PDF fonts. */
function safe(text: string): string {
  return text.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export type CertificateWithRelations = Certificate & { event: Event & { tenant: Tenant } };

/** Renders a landscape A4 certificate PDF on demand. */
export async function renderCertificatePdf(cert: CertificateWithRelations): Promise<Uint8Array> {
  const tenant = cert.event.tenant;
  const theme = themeOf(tenant);
  const primary = hexToRgb(theme.colors.primary);
  const accent = hexToRgb(theme.colors.accent, rgb(0.96, 0.62, 0.04));
  const ink = hexToRgb(theme.colors.fg, rgb(0.06, 0.09, 0.16));
  const muted = hexToRgb(theme.colors.muted, rgb(0.4, 0.45, 0.53));

  const doc = await PDFDocument.create();
  doc.setTitle(`${TITLES[cert.type]} - ${cert.recipientName}`);
  doc.setAuthor(tenant.name);
  const page = doc.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Frame
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0, y: height - 18, width, height: 18, color: primary });
  page.drawRectangle({ x: 0, y: 0, width, height: 18, color: primary });
  page.drawRectangle({ x: 28, y: 36, width: width - 56, height: height - 72, borderColor: accent, borderWidth: 2 });

  const center = (text: string, y: number, size: number, font = regular, color = ink) => {
    const t = safe(text);
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: (width - w) / 2, y, size, font, color });
  };
  const fit = (text: string, max: number, font = regular, start = 34) => {
    let size = start;
    while (size > 12 && font.widthOfTextAtSize(safe(text), size) > max) size -= 1;
    return size;
  };

  center(tenant.name.toUpperCase(), height - 90, 16, bold, primary);
  center(TITLES[cert.type], height - 140, fit(TITLES[cert.type], width - 160, bold, 28), bold, ink);
  center("This is to certify that", height - 190, 14, regular, muted);
  center(cert.recipientName, height - 245, fit(cert.recipientName, width - 200, serif, 44), serif, primary);
  page.drawLine({ start: { x: width / 2 - 180, y: height - 258 }, end: { x: width / 2 + 180, y: height - 258 }, thickness: 1, color: accent });

  const verb = ["JUDGE", "SPEAKER", "VOLUNTEER", "MENTOR"].includes(cert.type) ? "contributed to" : "participated in";
  center(`has ${verb}`, height - 290, 14, regular, muted);
  center(cert.event.title, height - 322, fit(cert.event.title, width - 200, bold, 22), bold, ink);
  if (cert.detail) center(cert.detail, height - 350, 14, regular, ink);
  const dateStr = cert.event.startsAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  center(`held on ${dateStr}`, height - 375, 12, regular, muted);

  // Verification block
  const base = await brandBaseUrl(tenant.id);
  const url = verifyUrl(base, cert.serial);
  const qrPng = await QRCode.toBuffer(url, { margin: 0, width: 240 });
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: width - 150, y: 60, width: 80, height: 80 });
  page.drawText(safe(`Certificate ID: ${cert.serial}`), { x: 60, y: 84, size: 10, font: bold, color: ink });
  page.drawText(safe(`Verify at ${url}`), { x: 60, y: 68, size: 9, font: regular, color: muted });
  page.drawText(safe(`Issued ${cert.issuedAt.toISOString().slice(0, 10)} · Powered by Elevate`), { x: 60, y: 52, size: 8, font: regular, color: muted });

  return doc.save();
}

/** LinkedIn "Add to profile" link for a certificate. */
export function addToProfileUrl(opts: {
  certName: string;
  orgName: string;
  orgId?: string;
  issuedAt: Date;
  certUrl: string;
  certId: string;
}): string {
  const p = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: opts.certName,
    issueYear: String(opts.issuedAt.getFullYear()),
    issueMonth: String(opts.issuedAt.getMonth() + 1),
    certUrl: opts.certUrl,
    certId: opts.certId,
  });
  if (opts.orgId) p.set("organizationId", opts.orgId);
  else p.set("organizationName", opts.orgName);
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}

export async function certificateLinks(cert: CertificateWithRelations) {
  const base = await brandBaseUrl(cert.event.tenantId);
  const verify = verifyUrl(base, cert.serial);
  const apiBase = process.env.API_PUBLIC_URL ?? "http://localhost:4000";
  return {
    verifyUrl: verify,
    pdfUrl: `${apiBase}/v1/certificates/${cert.serial}.pdf`,
    addToLinkedInUrl: addToProfileUrl({
      certName: `${TITLES[cert.type]} — ${cert.event.title}`,
      orgName: cert.event.tenant.name,
      orgId: settingsOf(cert.event.tenant).linkedinOrgId,
      issuedAt: cert.issuedAt,
      certUrl: verify,
      certId: cert.serial,
    }),
  };
}

export const CERTIFICATE_TITLES = TITLES;
