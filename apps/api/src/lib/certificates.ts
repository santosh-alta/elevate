import { PDFDocument, rgb, type RGB } from "pdf-lib";
import { drawCustomCertificate, resolveDesign } from "./certificateDesign";
import QRCode from "qrcode";
import type { Certificate, CertificateType, Event, RegistrationStatus, Tenant } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { brandBaseUrl, settingsOf, themeOf, verifyUrl, type Signatory } from "./brand";
import { embedBrandImage, embedFonts, hexToRgb, shade, type PdfFont } from "./brandAssets";
import { brandCode, certificateSerial } from "./codes";
import { notifyCertificate, safely } from "./notify";

const TITLES: Record<CertificateType, string> = {
  PARTICIPATION: "Certificate of Participation",
  FINALIST: "Certificate of Achievement — Finalist",
  WINNER: "Certificate of Excellence",
  RUNNER_UP: "Certificate of Excellence — Runner-up",
  SPECIAL_MENTION: "Certificate of Merit — Special Mention",
  JUDGE: "Certificate of Appreciation — Judge",
  SPEAKER: "Certificate of Appreciation — Speaker",
  VOLUNTEER: "Certificate of Appreciation — Volunteer",
  MENTOR: "Certificate of Appreciation — Mentor",
};

// Winners and both runners-up get a WINNER certificate; the detail line says which place.
const AWARD_TO_TYPE: Record<string, CertificateType> = {
  WINNER: "WINNER",
  RUNNER_UP: "WINNER",
  SECOND_RUNNER_UP: "WINNER",
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
  RUNNER_UP: "1st runner-up",
  SECOND_RUNNER_UP: "2nd runner-up",
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
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { tenant: { select: { name: true } } } });
  const prefix = brandCode(event.tenant.name);
  const modules = (event.modules ?? {}) as Record<string, boolean>;
  const recipients: Recipient[] = [];

  const config = (event.config ?? {}) as { certifyAllRegistered?: boolean; finalistTeamIds?: string[] };

  // Awards from published team results.
  const awarded = await prisma.team.findMany({
    where: { eventId, award: { not: null } },
    include: { members: { include: { user: true } } },
  });
  const awardedUsers = new Set<string>();
  for (const team of awarded) {
    const type = AWARD_TO_TYPE[team.award!];
    if (!type) continue;
    for (const m of team.members) {
      awardedUsers.add(m.userId);
      recipients.push({ userId: m.userId, name: m.user.name, type, detail: `${AWARD_LABEL[team.award!]} — Team ${team.name}` });
    }
  }

  // Finalists: teams shortlisted into the last judging round (or named when results were published) that didn't win.
  const lastRound = await prisma.judgingRound.findFirst({ where: { eventId }, orderBy: { sortOrder: "desc" }, include: { teams: true } });
  const finalistIds = new Set([...(lastRound?.restrictTeams ? lastRound.teams.map((t) => t.teamId) : []), ...(config.finalistTeamIds ?? [])]);
  for (const t of awarded) finalistIds.delete(t.id);
  if (finalistIds.size) {
    const finalists = await prisma.team.findMany({ where: { eventId, id: { in: [...finalistIds] } }, include: { members: { include: { user: true } } } });
    for (const team of finalists) {
      for (const m of team.members) {
        if (awardedUsers.has(m.userId)) continue;
        awardedUsers.add(m.userId);
        recipients.push({ userId: m.userId, name: m.user.name, type: "FINALIST", detail: `Finalist — Team ${team.name}` });
      }
    }
  }

  // Participation for everyone else who took part: online events count APPROVED, offline ones only CHECKED_IN
  // (unless check-in isn't used or config.certifyAllRegistered is set).
  const statuses: RegistrationStatus[] =
    modules.checkin === false || config.certifyAllRegistered
      ? ["REGISTERED", "APPROVED", "CHECKED_IN"]
      : event.mode === "ONLINE"
        ? ["APPROVED", "CHECKED_IN"]
        : ["CHECKED_IN"];
  const regs = await prisma.registration.findMany({ where: { eventId, status: { in: statuses } }, include: { user: true } });
  for (const r of regs) {
    if (awardedUsers.has(r.userId)) continue;
    recipients.push({ userId: r.userId, name: r.user.name, type: "PARTICIPATION" });
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
        recipientName: r.name, detail: r.detail, serial: certificateSerial(prefix),
      },
    });
    safely("certificate.ready", () => notifyCertificate(cert.id));
    created++;
  }
  const total = await prisma.certificate.count({ where: { eventId, revokedAt: null } });
  return { created, total };
}

// ───────── PDF ─────────

const DISPLAY_TZ = process.env.DISPLAY_TZ ?? "Asia/Kolkata";

/** Second title line, under "CERTIFICATE OF". */
const TITLE_WORD: Record<CertificateType, string> = {
  PARTICIPATION: "PARTICIPATION",
  WINNER: "EXCELLENCE",
  RUNNER_UP: "EXCELLENCE",
  SPECIAL_MENTION: "MERIT",
  FINALIST: "ACHIEVEMENT",
  JUDGE: "APPRECIATION",
  SPEAKER: "APPRECIATION",
  MENTOR: "APPRECIATION",
  VOLUNTEER: "APPRECIATION",
};

const ROLE_KICKER: Partial<Record<CertificateType, string>> = {
  FINALIST: "Finalist", JUDGE: "Judge", SPEAKER: "Speaker", MENTOR: "Mentor", VOLUNTEER: "Volunteer",
};

const DEFAULT_SIGNATORIES: Signatory[] = [{ title: "Event Lead" }, { title: "Director" }];

interface TemplateDesign {
  title?: string;
  signatories?: Signatory[];
}

function eventDates(start: Date, end: Date): string {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IN", { timeZone: DISPLAY_TZ, ...o });
  const full = (d: Date) => fmt(d, { day: "numeric", month: "long", year: "numeric" });
  if (full(start) === full(end) || end < start) return full(start);
  const sameMonth = fmt(start, { month: "long", year: "numeric" }) === fmt(end, { month: "long", year: "numeric" });
  return sameMonth ? `${fmt(start, { day: "numeric" })}–${full(end)}` : `${fmt(start, { day: "numeric", month: "long" })} – ${full(end)}`;
}

/** Headline, kicker and detail line for each certificate type. */
function wording(cert: Certificate, eventTitle: string, dates: string) {
  const [first, ...rest] = (cert.detail ?? "").split(" — ");
  const firstIsLabel = !!first && !first.startsWith('"');
  let kicker = ROLE_KICKER[cert.type];
  let detail = cert.detail ?? "";
  let body: string;
  switch (cert.type) {
    case "WINNER":
    case "RUNNER_UP":
    case "SPECIAL_MENTION":
      kicker = firstIsLabel ? first : cert.type === "SPECIAL_MENTION" ? "Special Mention" : "Winner";
      detail = firstIsLabel ? rest.join(" — ") : detail;
      body = `in recognition of exceptional performance at ${eventTitle}`;
      break;
    case "FINALIST":
      detail = first === "Finalist" ? rest.join(" — ") : detail;
      body = `for reaching the finals of ${eventTitle}`;
      break;
    case "JUDGE":
      body = `in appreciation of serving as a judge at ${eventTitle}`;
      break;
    case "SPEAKER":
      if (firstIsLabel) {
        kicker = first;
        detail = rest.join(" — ");
      }
      body = `in appreciation of speaking at ${eventTitle}`;
      break;
    case "MENTOR":
      body = `in appreciation of mentoring participants at ${eventTitle}`;
      break;
    case "VOLUNTEER":
      body = `in appreciation of volunteering at ${eventTitle}`;
      break;
    default:
      body = `for participating in ${eventTitle}`;
  }
  return { kicker, body, detail, sub: [detail, dates].filter(Boolean).join("  ·  ") };
}

/** Small deterministic PRNG so a brand's panel pattern is stable between renders. */
function prng(seedText: string) {
  let a = [...seedText].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(text: string, f: PdfFont, size: number, max: number, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && f.width(next, size) > max) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
    while (last.length > 1 && f.width(`${last}…`, size) > max) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

export type CertificateWithRelations = Certificate & { event: Event & { tenant: Tenant } };

/**
 * Renders a landscape A4 certificate PDF on demand, in the brand's colours and logo:
 * accent frame, hero-coloured side panel with the logo and verification QR, serif title,
 * script recipient name, signatories, and a seal in the highlight colour.
 */
export async function renderCertificatePdf(cert: CertificateWithRelations): Promise<Uint8Array> {
  const tenant = cert.event.tenant;
  const theme = themeOf(tenant);
  const settings = settingsOf(tenant);
  const c = theme.colors;
  const accent = hexToRgb(c.accent);
  const heroBg = hexToRgb(c.heroBg);
  const heroFg = hexToRgb(c.heroFg, rgb(1, 1, 1));
  const ink = hexToRgb(c.fg, rgb(0.06, 0.09, 0.16));
  const muted = hexToRgb(c.muted, rgb(0.4, 0.45, 0.53));
  const highlight = hexToRgb(c.highlight, rgb(0.99, 0.75, 0.15));
  const white = rgb(1, 1, 1);

  const template = await prisma.certificateTemplate
    .findUnique({ where: { tenantId_type: { tenantId: tenant.id, type: cert.type } } })
    .catch(() => null);
  const design = (template?.design ?? {}) as TemplateDesign;

  const doc = await PDFDocument.create();
  doc.setTitle(`${TITLES[cert.type]} - ${cert.recipientName}`);
  doc.setAuthor(tenant.name);
  doc.setCreator(tenant.name);
  doc.setProducer(tenant.name);
  const page = doc.addPage([841.89, 595.28]); // A4 landscape

  // "Our own design": the uploaded artwork with the person's details printed on top.
  const custom = resolveDesign(cert.event.config, tenant.settings, cert.type);
  if (custom) {
    const dates = eventDates(cert.event.startsAt, cert.event.endsAt);
    const w = wording(cert, cert.event.title, dates);
    const award = cert.type === "PARTICIPATION" ? undefined : [w.kicker, w.detail].filter(Boolean).join("  ·  ") || undefined;
    const ok = await drawCustomCertificate(doc, page, custom, {
      name: cert.recipientName,
      award,
      full: `${w.body}  ·  ${dates}`,
      serial: cert.serial,
      verifyUrl: verifyUrl(await brandBaseUrl(tenant.id), cert.serial),
      issued: cert.issuedAt.toLocaleDateString("en-IN", { timeZone: DISPLAY_TZ, day: "numeric", month: "short", year: "numeric" }),
    });
    if (ok) return doc.save();
    // Background couldn't be loaded: fall through to the standard design rather than issue a blank certificate.
  }
  const { width: W, height: H } = page.getSize();
  const fonts = await embedFonts(doc);

  const text = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB, opacity = 1) => {
    const p = f.pick(t);
    page.drawText(p.text, { x, y, size, font: p.font, color, opacity });
  };
  const fitSize = (t: string, f: PdfFont, start: number, min: number, max: number) => {
    let s = start;
    while (s > min && f.width(t, s) > max) s -= 0.5;
    return s;
  };
  const tracked = (t: string, x: number, y: number, size: number, f: PdfFont, color: RGB, spacing: number) => {
    let cx = x;
    for (const ch of t) {
      text(ch, cx, y, size, f, color);
      cx += f.width(ch, size) + spacing;
    }
    return cx - x;
  };

  // ── Frame: accent border and a thin inner rule
  const FRAME = 14;
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: accent });
  page.drawRectangle({ x: FRAME, y: FRAME, width: W - FRAME * 2, height: H - FRAME * 2, color: white });
  const INSET = 24;
  page.drawRectangle({ x: INSET, y: INSET, width: W - INSET * 2, height: H - INSET * 2, borderColor: heroBg, borderWidth: 0.8, borderOpacity: 0.55 });

  // ── Left panel with a faceted pattern
  const PX = INSET + 6;
  const PY = INSET + 6;
  const PW = 214;
  const PH = H - PY * 2;
  page.drawRectangle({ x: PX, y: PY, width: PW, height: PH, color: heroBg });
  const rand = prng(tenant.slug);
  const cols = 4;
  const rows = 8;
  const pts: { x: number; y: number }[][] = [];
  for (let r = 0; r <= rows; r++) {
    pts.push([]);
    for (let q = 0; q <= cols; q++) {
      const edgeX = q === 0 || q === cols;
      const edgeY = r === 0 || r === rows;
      pts[r].push({
        x: PX + (q / cols) * PW + (edgeX ? 0 : (rand() - 0.5) * (PW / cols) * 0.8),
        y: PY + (r / rows) * PH + (edgeY ? 0 : (rand() - 0.5) * (PH / rows) * 0.8),
      });
    }
  }
  const tri = (a: { x: number; y: number }, b: { x: number; y: number }, d: { x: number; y: number }) => {
    // drawSvgPath flips y: path coordinates are measured downwards from the origin.
    const path = `M ${a.x} ${-a.y} L ${b.x} ${-b.y} L ${d.x} ${-d.y} Z`;
    const light = rand() < 0.5;
    page.drawSvgPath(path, { x: 0, y: 0, color: light ? heroFg : rgb(0, 0, 0), opacity: light ? 0.02 + rand() * 0.07 : 0.03 + rand() * 0.08 });
  };
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const [p00, p10, p01, p11] = [pts[r][q], pts[r][q + 1], pts[r + 1][q], pts[r + 1][q + 1]];
      if (rand() < 0.5) {
        tri(p00, p10, p11);
        tri(p00, p11, p01);
      } else {
        tri(p00, p10, p01);
        tri(p10, p11, p01);
      }
    }
  }

  // Logo (dark-background version) or the brand name
  const logo = await embedBrandImage(doc, theme.logoDarkUrl ?? theme.logoUrl);
  const logoTop = H - PY - 44;
  if (logo) {
    const lw = Math.min(PW - 56, (logo.width / logo.height) * 64);
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: PX + (PW - lw) / 2, y: logoTop - lh, width: lw, height: lh });
  } else {
    const lines = wrap(tenant.name.toUpperCase(), fonts.sansBold, 18, PW - 48, 3);
    lines.forEach((l, i) => {
      const s = fitSize(l, fonts.sansBold, 18, 10, PW - 48);
      text(l, PX + (PW - fonts.sansBold.width(l, s)) / 2, logoTop - 18 - i * 22, s, fonts.sansBold, heroFg);
    });
  }
  if (theme.tagline) {
    const tl = wrap(theme.tagline, fonts.sans, 9.5, PW - 60, 2);
    const ty = logoTop - (logo ? (logo.height / logo.width) * Math.min(PW - 56, (logo.width / logo.height) * 64) : 60) - 26;
    page.drawLine({ start: { x: PX + PW / 2 - 18, y: ty + 14 }, end: { x: PX + PW / 2 + 18, y: ty + 14 }, thickness: 1.5, color: accent });
    tl.forEach((l, i) => text(l, PX + (PW - fonts.sans.width(l, 9.5)) / 2, ty - i * 13, 9.5, fonts.sans, heroFg, 0.85));
  }

  // Verification QR on a white tile at the bottom of the panel
  const base = await brandBaseUrl(tenant.id);
  const url = verifyUrl(base, cert.serial);
  const qrPng = await QRCode.toBuffer(url, { margin: 0, width: 300, color: { dark: c.heroBg.length === 7 ? `${c.heroBg}ff` : "#000000ff", light: "#ffffffff" } });
  const qr = await doc.embedPng(qrPng);
  const QR = 74;
  const tile = QR + 14;
  const tileX = PX + (PW - tile) / 2;
  const tileY = PY + 46;
  page.drawRectangle({ x: tileX, y: tileY, width: tile, height: tile, color: white });
  page.drawImage(qr, { x: tileX + 7, y: tileY + 7, width: QR, height: QR });
  const scan = "SCAN TO VERIFY";
  const scanW = (() => { let w = 0; for (const ch of scan) w += fonts.sansSemi.width(ch, 7.5) + 1.2; return w - 1.2; })();
  tracked(scan, PX + (PW - scanW) / 2, PY + 28, 7.5, fonts.sansSemi, heroFg, 1.2);

  // ── Ribbon and seal (top right)
  const sealX = W - INSET - 92;
  const ribbonW = 40;
  const sealY = H - INSET - 104;
  page.drawRectangle({ x: sealX - ribbonW / 2, y: sealY, width: ribbonW, height: H - INSET - 0.4 - sealY, color: heroBg });
  const tailColor = shade(highlight, -0.22);
  for (const dir of [-1, 1]) {
    // Ribbon tails with a V notch
    const x0 = sealX + dir * 8;
    const pts2 = [
      [x0 - 9, sealY - 0], [x0 + 9, sealY - 0],
      [x0 + 9 + dir * 12, sealY - 56], [x0 + dir * 12, sealY - 48], [x0 - 9 + dir * 12, sealY - 56],
    ];
    page.drawSvgPath(`M ${pts2.map(([x, y]) => `${x} ${-y}`).join(" L ")} Z`, { x: 0, y: 0, color: tailColor });
  }
  const starburst = (cx: number, cy: number, n: number, ro: number, ri: number) => {
    const parts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? ro : ri;
      const a = (Math.PI * i) / n - Math.PI / 2;
      parts.push(`${i === 0 ? "M" : "L"} ${cx + r * Math.cos(a)} ${-(cy + r * Math.sin(a))}`);
    }
    return `${parts.join(" ")} Z`;
  };
  page.drawSvgPath(starburst(sealX, sealY, 30, 36, 32.5), { x: 0, y: 0, color: highlight });
  page.drawCircle({ x: sealX, y: sealY, size: 27, color: shade(highlight, 0.18), borderColor: shade(highlight, -0.3), borderWidth: 1.2 });
  page.drawCircle({ x: sealX, y: sealY, size: 23, borderColor: shade(highlight, -0.3), borderWidth: 0.5, borderOpacity: 0.7 });
  page.drawSvgPath(starburst(sealX, sealY, 5, 12, 5), { x: 0, y: 0, color: shade(highlight, -0.3) });

  // ── Content
  const X = PX + PW + 48;
  const RIGHT = W - INSET - 40;
  const titleMax = sealX - 46 - X;
  const dates = eventDates(cert.event.startsAt, cert.event.endsAt);
  const words = wording(cert, cert.event.title, dates);

  let y = H - INSET - 92;
  if (words.kicker) tracked(words.kicker.toUpperCase(), X, y, 9.5, fonts.sansBold, accent, 1.8);
  y -= 44;
  const titleLines = design.title
    ? wrap(design.title.toUpperCase(), fonts.serif, 34, titleMax, 2)
    : ["CERTIFICATE OF", TITLE_WORD[cert.type]];
  for (const l of titleLines) {
    text(l, X, y, fitSize(l, fonts.serif, 38, 20, titleMax), fonts.serif, ink);
    y -= 44;
  }
  y += 12;
  text("This certificate is proudly presented to", X, y, 11, fonts.sans, muted);

  // Recipient name in script, with a rule underneath
  const nameMax = RIGHT - X;
  const nameSize = fitSize(cert.recipientName, fonts.script, 60, 26, nameMax);
  y -= 68;
  text(cert.recipientName, X, y, nameSize, fonts.script, ink);
  y -= 18;
  page.drawLine({ start: { x: X, y }, end: { x: RIGHT, y }, thickness: 0.8, color: muted, opacity: 0.6 });

  y -= 34;
  for (const l of wrap(words.body, fonts.sansSemi, 13.5, nameMax, 2)) {
    text(l, X, y, 13.5, fonts.sansSemi, ink);
    y -= 19;
  }
  y -= 6;
  for (const l of wrap(words.sub, fonts.sans, 11, nameMax, 2)) {
    text(l, X, y, 11, fonts.sans, muted);
    y -= 15;
  }

  // Signatories
  const signatories = (design.signatories?.length ? design.signatories : settings.signatories?.length ? settings.signatories : DEFAULT_SIGNATORIES).slice(0, 3);
  const sigW = signatories.length > 2 ? 140 : 165;
  const sigGap = signatories.length > 2 ? 22 : 40;
  const sigY = 124;
  for (const [i, s] of signatories.entries()) {
    const sx = X + i * (sigW + sigGap);
    const sig = await embedBrandImage(doc, s.signatureUrl);
    if (sig) {
      const sh = 34;
      const sw = Math.min(sigW, (sig.width / sig.height) * sh);
      page.drawImage(sig, { x: sx, y: sigY + 4, width: sw, height: (sig.height / sig.width) * sw });
    }
    page.drawLine({ start: { x: sx, y: sigY }, end: { x: sx + sigW, y: sigY }, thickness: 0.8, color: muted, opacity: 0.7 });
    let ly = sigY - 15;
    if (s.name) {
      text(s.name, sx, ly, fitSize(s.name, fonts.sansSemi, 10.5, 7, sigW), fonts.sansSemi, ink);
      ly -= 13;
    }
    if (s.title) text(s.title, sx, ly, fitSize(s.title, fonts.sans, 9, 6.5, sigW), fonts.sans, muted);
  }

  // Serial and verification link
  const idLabel = `Certificate ID  ${cert.serial}`;
  text(idLabel, X, INSET + 20, 8, fonts.sansSemi, ink);
  const verifyText = `Verify at ${url.replace(/^https?:\/\//, "")}`;
  text(verifyText, X + fonts.sansSemi.width(idLabel, 8) + 14, INSET + 20, 8, fonts.sans, muted);
  const issued = `Issued ${cert.issuedAt.toLocaleDateString("en-IN", { timeZone: DISPLAY_TZ, day: "numeric", month: "short", year: "numeric" })}`;
  text(issued, RIGHT - fonts.sans.width(issued, 8), INSET + 20, 8, fonts.sans, muted);

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
