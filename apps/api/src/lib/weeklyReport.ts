import { PDFDocument, rgb, type PDFPage, type RGB } from "pdf-lib";
import type { Prisma } from "@prisma/client";
import { EVENT_TYPE_LABELS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { brandBaseUrl, themeOf } from "./brand";
import { drawGradientBar, embedBrandImage, embedFonts, hexToRgb, shade, type PdfFont } from "./brandAssets";
import { sendEmail } from "./mailer";
import { fromAddress, renderEmailHtml } from "./notify";
import { reportSettingsOf } from "./afterEvent";
import { computeInsights } from "../routes/insights";

/**
 * Weekly combined report for leadership (same recipients as the event reports): last week's events with numbers
 * and ratings, what's coming up in the next two weeks, campus comparison over 30 days, and what needs attention.
 * Sent once a week (brand setting: day and hour, India time) with a PDF attached.
 */
const TZ = process.env.DISPLAY_TZ || "Asia/Kolkata";
const DAY = 86_400_000;

export type WeeklySettings = { enabled: boolean; weekday: number; hour: number; lastSentWeek?: string };
export function weeklySettingsOf(settings: unknown): WeeklySettings {
  const w = ((settings ?? {}) as { weeklyReport?: Partial<WeeklySettings> }).weeklyReport ?? {};
  const wd = Number(w.weekday);
  const h = Number(w.hour);
  return {
    enabled: w.enabled !== false,
    weekday: Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : 1,
    hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 9,
    lastSentWeek: w.lastSentWeek,
  };
}

/** India-time parts of a date. */
function ist(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, weekday };
}
const day = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short" });

/** Worker: sends each brand's weekly report once, on its chosen day after its chosen hour. */
export async function sendWeeklyReportsDue(now = new Date()): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  const t0 = ist(now);
  for (const t of tenants) {
    const w = weeklySettingsOf(t.settings);
    const r = reportSettingsOf(t.settings);
    if (!w.enabled || !r.to.length || t0.weekday !== w.weekday || t0.hour < w.hour || w.lastSentWeek === t0.date) continue;
    // Claim this week first so a restart can't send it twice.
    const fresh = await prisma.tenant.findUniqueOrThrow({ where: { id: t.id }, select: { settings: true } });
    if (weeklySettingsOf(fresh.settings).lastSentWeek === t0.date) continue;
    const settings = { ...((fresh.settings ?? {}) as Record<string, unknown>) };
    settings.weeklyReport = { ...((settings.weeklyReport ?? {}) as object), lastSentWeek: t0.date };
    await prisma.tenant.update({ where: { id: t.id }, data: { settings: settings as Prisma.InputJsonValue } });
    try {
      await sendWeeklyReport(t.id);
    } catch (e) {
      console.warn("[weekly] failed", t.id, e);
    }
  }
}

type Insights = Awaited<ReturnType<typeof computeInsights>>;

async function gather(tenantId: string, now: Date) {
  const to = now;
  const from = new Date(to.getTime() - 7 * DAY);
  const [week, month] = await Promise.all([
    computeInsights(tenantId, { from, prevFrom: new Date(from.getTime() - 7 * DAY), to, months: 1 }),
    computeInsights(tenantId, { from: new Date(to.getTime() - 30 * DAY), prevFrom: new Date(to.getTime() - 60 * DAY), to, months: 1 }),
  ]);
  const upcomingRows = await prisma.event.findMany({
    where: { tenantId, startsAt: { gte: to, lt: new Date(to.getTime() + 14 * DAY) }, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true, title: true, type: true, startsAt: true, status: true, approvalStatus: true, capacity: true, scope: true,
      category: { select: { name: true } }, campuses: { select: { campus: { select: { name: true } } } },
      _count: { select: { registrations: { where: { status: { in: ["REGISTERED", "APPROVED", "CHECKED_IN"] } } } } },
    },
  });
  const upcoming = upcomingRows.map((e) => ({
    id: e.id, title: e.title, type: e.category?.name ?? EVENT_TYPE_LABELS[e.type], startsAt: e.startsAt,
    campus: e.scope === "CENTRAL" ? "All campuses (HQ)" : e.campuses.map((c) => c.campus.name).join(", "),
    registered: e._count.registrations, capacity: e.capacity,
    state: e.status === "DRAFT" || e.status === "PLANNING" ? (e.approvalStatus === "PENDING" ? "awaiting approval" : "draft") : e.status === "REGISTRATION_OPEN" ? "registration open" : e.status.toLowerCase().replace(/_/g, " "),
  }));
  const [pendingApproval, overdueTasks] = await Promise.all([
    prisma.event.count({ where: { tenantId, approvalStatus: "PENDING" } }),
    prisma.eventTask.count({ where: { event: { tenantId, status: { notIn: ["DRAFT", "COMPLETED", "ARCHIVED", "CANCELLED"] } }, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { lt: to } } }),
  ]);
  return { from, to, week, month, upcoming, pendingApproval, overdueTasks };
}

/** Data for the weekly report (also used to preview the PDF). */
export async function weeklyData(tenantId: string) {
  const g = await gather(tenantId, new Date());
  return { g, att: attention(g) };
}

function attention(g: Awaited<ReturnType<typeof gather>>): string[] {
  const out: string[] = [];
  const soon = g.upcoming.filter((u) => u.startsAt.getTime() - g.to.getTime() < 4 * DAY);
  for (const u of soon) {
    if (u.state === "draft" || u.state === "awaiting approval") out.push(`${u.title} (${day(u.startsAt)}) is still a ${u.state}.`);
    else if (u.capacity && u.registered < u.capacity * 0.3) out.push(`${u.title} (${day(u.startsAt)}) has only ${u.registered} of ${u.capacity} seats filled.`);
  }
  if (g.pendingApproval) out.push(`${g.pendingApproval} event${g.pendingApproval > 1 ? "s are" : " is"} waiting for approval.`);
  if (g.overdueTasks) out.push(`${g.overdueTasks} checklist task${g.overdueTasks > 1 ? "s are" : " is"} overdue.`);
  const lowRated = g.week.events.filter((e) => e.rating != null && e.responses >= 5 && e.rating < 3.5);
  for (const e of lowRated) out.push(`${e.title} was rated ${e.rating}/5. Worth a look at its report.`);
  return out;
}

const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}% vs previous week` : "");

export async function sendWeeklyReport(tenantId: string): Promise<{ to: string[]; cc: string[] }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const cfg = reportSettingsOf(tenant.settings);
  if (!cfg.to.length) throw new Error("No report recipients");
  const g = await gather(tenantId, new Date());
  const base = await brandBaseUrl(tenantId);
  const t = g.week.totals;
  const names = await prisma.user.findMany({ where: { email: { in: cfg.to } }, select: { name: true } });
  const hi = names.length === 1 ? names[0].name.split(" ")[0] : "all";

  const lines: string[] = [];
  lines.push(`Hi ${hi},`, "", `Here's the weekly events report for ${day(g.from)} – ${day(g.to)}. The full report is attached as a PDF.`);
  lines.push("", "This week", ...[
    `• Events held: ${t.events}${t.prevEvents || t.events ? ` (${t.prevEvents} the week before)` : ""}`,
    `• Participants: ${t.participants.toLocaleString("en-IN")} ${pct(t.participants, t.prevParticipants)}`.trim(),
    t.attendanceRate != null ? `• Attendance: ${t.attendanceRate}% of registered` : null,
    t.rating != null ? `• Feedback: ${t.rating}/5 from ${t.responses} responses` : "• Feedback: none collected this week",
  ].filter(Boolean) as string[]);
  lines.push("", "Events held");
  if (g.week.events.length) {
    for (const e of g.week.events) lines.push(`• ${e.title} (${e.type}), ${e.campus}: ${e.participants ? `${e.participants} people` : "turnout not recorded"}${e.attendanceRate != null ? `, ${e.attendanceRate}% attended` : ""}${e.rating != null ? `, rated ${e.rating}/5` : ""}`);
  } else lines.push("• No events this week");
  lines.push("", "Coming up (next 2 weeks)");
  if (g.upcoming.length) {
    for (const u of g.upcoming) lines.push(`• ${day(u.startsAt)}: ${u.title} (${u.type}), ${u.campus} · ${u.state}${u.registered ? ` · ${u.registered}${u.capacity ? `/${u.capacity}` : ""} registered` : ""}`);
  } else lines.push("• Nothing scheduled");
  lines.push("", "Campuses (last 30 days)");
  const showReach = g.month.byCampus.some((c) => c.reached > 0);
  for (const c of g.month.byCampus.filter((c) => c.events || c.students)) {
    lines.push(`• ${c.name}: ${c.events} event${c.events === 1 ? "" : "s"}, ${c.participants.toLocaleString("en-IN")} participants${showReach && c.reach != null ? `, ${c.reach}% of students reached` : ""}${c.rating != null ? `, rated ${c.rating}/5` : ""}`);
  }
  const att = attention(g);
  if (att.length) lines.push("", "Needs attention", ...att.map((x) => `• ${x}`));
  lines.push("", `See all charts and event scorecards: ${base}/admin/insights`);

  const subject = `Weekly events report: ${day(g.from)} – ${day(g.to)}`;
  const text = lines.join("\n");
  const pdf = await renderWeeklyPdf(tenant, g, att);
  await sendEmail({
    from: fromAddress(tenant),
    to: cfg.to.join(", "),
    ...(cfg.cc.length && { cc: cfg.cc.filter((c) => !cfg.to.includes(c)) }),
    subject, text,
    html: await renderEmailHtml(tenant, subject, text, { label: "Open Insights", url: `${base}/admin/insights` }),
    attachments: [{ filename: `weekly-report-${ist(g.to).date}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  return { to: cfg.to, cc: cfg.cc };
}

/** A4 weekly summary in the brand's look: KPIs, events held, coming up, campus comparison, needs attention. */
export async function renderWeeklyPdf(
  tenant: Prisma.TenantGetPayload<object>, g: Awaited<ReturnType<typeof gather>>, att: string[],
): Promise<Uint8Array> {
  const W = 595.28, H = 841.89, M = 44;
  const theme = themeOf(tenant);
  const c = theme.colors;
  const heroBg = hexToRgb(c.heroBg), heroFg = hexToRgb(c.heroFg, rgb(1, 1, 1)), primary = hexToRgb(c.primary), accent = hexToRgb(c.accent);
  const ink = hexToRgb(c.fg, rgb(0.06, 0.09, 0.16)), muted = hexToRgb(c.muted, rgb(0.42, 0.45, 0.52)), line = hexToRgb(c.border, rgb(0.88, 0.9, 0.93));
  const soft = shade(primary, 0.93);
  const [g1, g2] = (theme.gradient ?? [c.primary, c.accent]).map((x) => hexToRgb(x));
  const doc = await PDFDocument.create();
  doc.setTitle(`Weekly events report ${day(g.from)} – ${day(g.to)}`);
  doc.setAuthor(tenant.name); doc.setCreator(tenant.name); doc.setProducer(tenant.name);
  const fonts = await embedFonts(doc);
  const blank = () => { const p = doc.addPage([W, H]); p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) }); return p; };
  let page: PDFPage = blank();
  let y = H - M;
  const text = (s: string, x: number, yy: number, size: number, f: PdfFont, color: RGB) => { const p = f.pick(s); page.drawText(p.text, { x, y: yy, size, font: p.font, color }); };
  const clip = (s: string, f: PdfFont, size: number, max: number) => { if (f.width(s, size) <= max) return s; let x = s; while (x.length > 1 && f.width(`${x}…`, size) > max) x = x.slice(0, -1); return `${x}…`; };
  const need = (h: number) => { if (y - h < M + 20) { page = blank(); drawGradientBar(page, 0, H - 6, W, 6, g1, g2); y = H - M - 6; } };
  const section = (title: string) => { need(60); y -= 12; text(title, M, y, 14, fonts.sansBold, ink); page.drawRectangle({ x: M, y: y - 7, width: 26, height: 2.5, color: accent }); y -= 24; };
  const table = (cols: { label: string; w: number; right?: boolean }[], rows: string[][]) => {
    const head = () => { need(36); page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: soft }); let x = M + 6; for (const col of cols) { const tw = fonts.sansBold.width(col.label.toUpperCase(), 7); text(col.label.toUpperCase(), col.right ? x + col.w - 12 - tw : x, y, 7, fonts.sansBold, muted); x += col.w; } y -= 20; };
    head();
    rows.forEach((r) => {
      if (y - 16 < M + 20) { need(1000); head(); }
      let x = M + 6;
      r.forEach((cell, i) => { const f = i === 0 ? fonts.sansSemi : fonts.sans; const s = clip(cell, f, 8.5, cols[i].w - 10); text(s, cols[i].right ? x + cols[i].w - 12 - f.width(s, 8.5) : x, y, 8.5, f, ink); x += cols[i].w; });
      page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.4, color: line });
      y -= 16;
    });
    y -= 6;
  };

  // Header
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: heroBg });
  page.drawCircle({ x: W - 40, y: H - 40, size: 100, color: g1, opacity: 0.25 });
  drawGradientBar(page, 0, H - 155, W, 5, g1, g2);
  const logo = await embedBrandImage(doc, theme.logoDarkUrl ?? theme.logoUrl);
  if (logo) { const lw = Math.min(160, (logo.width / logo.height) * 28); page.drawImage(logo, { x: M, y: H - 30 - (logo.height / logo.width) * lw, width: lw, height: (logo.height / logo.width) * lw }); }
  text("WEEKLY EVENTS REPORT", W - M - fonts.sansBold.width("WEEKLY EVENTS REPORT", 9), H - 42, 9, fonts.sansBold, heroFg);
  text(`${day(g.from)} – ${day(g.to)}`, M, H - 100, 24, fonts.sansBold, heroFg);
  text(`${tenant.name} · all campuses`, M, H - 122, 10, fonts.sans, heroFg);
  y = H - 180;

  // KPI tiles
  const t = g.week.totals;
  const tiles: [string, string, string][] = [
    ["Events held", String(t.events), t.prevEvents || t.events ? `${t.prevEvents} the week before` : ""],
    ["Participants", t.participants.toLocaleString("en-IN"), pct(t.participants, t.prevParticipants).replace(" vs previous week", " vs last week")],
    ["Attendance", t.attendanceRate != null ? `${t.attendanceRate}%` : "–", "of registered"],
    ["Feedback", t.rating != null ? `${t.rating}/5` : "–", `${t.responses} responses`],
  ];
  const tw = (W - 2 * M - 30) / 4;
  tiles.forEach(([l, v, h], i) => {
    const x = M + i * (tw + 10);
    page.drawRectangle({ x, y: y - 50, width: tw, height: 58, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 });
    page.drawRectangle({ x, y: y + 6, width: tw, height: 2, color: i % 2 ? accent : primary });
    text(l.toUpperCase(), x + 10, y - 8, 7, fonts.sansSemi, muted);
    text(v, x + 10, y - 30, 18, fonts.sansBold, ink);
    if (h) text(clip(h, fonts.sans, 7, tw - 20), x + 10, y - 43, 7, fonts.sans, muted);
  });
  y -= 76;

  section("Events held this week");
  if (g.week.events.length) {
    table([{ label: "Event", w: 190 }, { label: "Campus", w: 130 }, { label: "People", w: 60, right: true }, { label: "Attended", w: 60, right: true }, { label: "Rating", w: W - 2 * M - 440, right: true }],
      g.week.events.map((e) => [e.title, e.campus, e.participants ? String(e.participants) : "–", e.attendanceRate != null ? `${e.attendanceRate}%` : "–", e.rating != null ? `${e.rating}/5` : "–"]));
  } else { text("No events this week.", M, y, 10, fonts.sans, muted); y -= 20; }

  section("Coming up in the next 2 weeks");
  if (g.upcoming.length) {
    table([{ label: "Date", w: 55 }, { label: "Event", w: 185 }, { label: "Campus", w: 120 }, { label: "Status", w: 85 }, { label: "Registered", w: W - 2 * M - 445, right: true }],
      g.upcoming.map((u) => [day(u.startsAt), u.title, u.campus, u.state, u.registered ? `${u.registered}${u.capacity ? `/${u.capacity}` : ""}` : "–"]));
  } else { text("Nothing scheduled.", M, y, 10, fonts.sans, muted); y -= 20; }

  section("Campus comparison (last 30 days)");
  const rows = g.month.byCampus.filter((cc) => cc.events || cc.students);
  const top = Math.max(1, ...rows.map((r) => r.participants));
  const showReach = rows.some((r) => r.reached > 0);
  for (const r of rows) {
    need(18);
    text(clip(r.name, fonts.sans, 9, 150), M, y, 9, fonts.sans, ink);
    const bw = Math.max(r.participants ? 2 : 0, ((W - 2 * M - 330) * r.participants) / top);
    page.drawRectangle({ x: M + 158, y: y - 2, width: W - 2 * M - 330, height: 9, color: soft });
    if (bw) page.drawRectangle({ x: M + 158, y: y - 2, width: bw, height: 9, color: primary });
    const right = `${r.participants.toLocaleString("en-IN")} people · ${r.events} ev${showReach && r.reach != null ? ` · ${r.reach}% reach` : ""}${r.rating != null ? ` · ${r.rating}/5` : ""}`;
    text(right, W - M - fonts.sans.width(right, 8), y, 8, fonts.sans, muted);
    y -= 16;
  }

  if (att.length) {
    section("Needs attention");
    for (const a of att) { need(14); page.drawCircle({ x: M + 3, y: y + 3, size: 1.8, color: accent }); text(clip(a, fonts.sans, 9.5, W - 2 * M - 14), M + 12, y, 9.5, fonts.sans, ink); y -= 14; }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const s = `${tenant.name} · Weekly events report · Page ${i + 1} of ${pages.length}`;
    const pk = fonts.sans.pick(s);
    p.drawText(pk.text, { x: M, y: 24, size: 7.5, font: pk.font, color: muted });
  });
  return doc.save();
}

export type { Insights };
