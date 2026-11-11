import { prisma } from "../plugins/prisma";
import { EVENT_TYPE_LABELS } from "@elevate/shared";
import { sendEmail } from "./mailer";
import { fmtDate, fromAddress, notifyAudience, renderEmailHtml } from "./notify";
import { brandBaseUrl } from "./brand";
import { summariseOutcome, type OutcomeSummary } from "./outcomeSummary";
import { renderEventReportPdf } from "./eventReport";
import { logActivity } from "./activity";

/**
 * After every event, automatically:
 *  1. feedback request to participants, about 2 hours after it ends (once)
 *  2. outcome report to leadership a few days later (default 7, so feedback and social posts are in):
 *     AI summary, key numbers, what participants said, social media links, and the PDF report attached.
 * Recipients and the delay are brand settings (Settings → Notifications).
 */
const HOUR = 3_600_000;
const SKIP = ["DRAFT", "PLANNING", "CANCELLED", "ARCHIVED"] as const;

export type ReportSettings = { to: string[]; cc: string[]; afterDays: number };
export function reportSettingsOf(settings: unknown): ReportSettings {
  const r = ((settings ?? {}) as { eventReport?: Partial<ReportSettings> }).eventReport ?? {};
  const emails = (v: unknown) => (Array.isArray(v) ? v.map(String).map((e) => e.trim().toLowerCase()).filter((e) => /\S+@\S+\.\S+/.test(e)) : []);
  const days = Number(r.afterDays);
  return { to: emails(r.to), cc: emails(r.cc), afterDays: Number.isFinite(days) && days >= 1 && days <= 30 ? days : 7 };
}

export async function requestFeedbackDue(now = new Date()): Promise<void> {
  // Brand setting: hours after the end (default 2).
  const delay = new Map((await prisma.tenant.findMany({ select: { id: true, settings: true } })).map((t) => {
    const h = Number(((t.settings ?? {}) as { notifications?: { feedbackAfterHours?: number } }).notifications?.feedbackAfterHours);
    return [t.id, Number.isFinite(h) && h > 0 ? h : 2];
  }));
  const candidates = await prisma.event.findMany({
    where: {
      feedbackRequestedAt: null, status: { notIn: [...SKIP] },
      endsAt: { lte: new Date(now.getTime() - 0.5 * HOUR), gte: new Date(now.getTime() - 7 * 24 * HOUR) },
    },
    select: { id: true, tenantId: true, endsAt: true },
    take: 50,
  });
  const events = candidates.filter((e) => e.endsAt.getTime() <= now.getTime() - (delay.get(e.tenantId) ?? 2) * HOUR).slice(0, 10);
  for (const e of events) {
    const claimed = await prisma.event.updateMany({ where: { id: e.id, feedbackRequestedAt: null }, data: { feedbackRequestedAt: now } });
    if (!claimed.count) continue;
    const sent = await notifyAudience(e.id, "feedback.request");
    await logActivity(e.id, null, "feedback.requested", { recipients: sent, automatic: true });
  }
}

export async function sendReportsDue(now = new Date()): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  for (const t of tenants) {
    const cfg = reportSettingsOf(t.settings);
    if (!cfg.to.length) continue;
    const events = await prisma.event.findMany({
      where: {
        tenantId: t.id, reportSentAt: null, status: { notIn: [...SKIP] },
        endsAt: { lte: new Date(now.getTime() - cfg.afterDays * 24 * HOUR), gte: new Date(now.getTime() - (cfg.afterDays + 30) * 24 * HOUR) },
      },
      select: { id: true },
      take: 3,
    });
    for (const e of events) {
      const claimed = await prisma.event.updateMany({ where: { id: e.id, reportSentAt: null }, data: { reportSentAt: now } });
      if (!claimed.count) continue;
      try {
        await sendEventReport(e.id, cfg);
      } catch (err) {
        // Let it try again later.
        await prisma.event.update({ where: { id: e.id }, data: { reportSentAt: null } });
        console.warn("[report] failed", e.id, err);
      }
    }
  }
}

type Numbers = {
  registrations?: { registered?: number; attended?: number; attendanceRate?: number };
  feedback?: { responses?: number; avgRating?: number | null; avgNps?: number | null; aspects?: Record<string, number> };
  certificates?: { issued?: number };
  linkedin?: { posted?: number; drafts?: number };
  teams?: { total?: number; winners?: { team: string; award: string | null }[] };
  tasks?: { total?: number; done?: number };
};

const ASPECT = { content: "Content", speakers: "Speakers & mentors", organisation: "Organisation", venue: "Venue / online experience" } as Record<string, string>;

/** Builds and sends one outcome report email (also used by "Send report now" in admin). */
export async function sendEventReport(eventId: string, cfg: ReportSettings): Promise<{ to: string[]; cc: string[] }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { tenant: true, category: { select: { name: true } }, campuses: { select: { campus: { select: { name: true } } } } },
  });
  let summary: OutcomeSummary | null = null;
  try {
    summary = (await summariseOutcome(eventId)).summary;
  } catch (e) {
    console.warn("[report] AI summary failed; sending numbers only", e);
  }
  const [{ pdf, filename }, fresh, social, linkedin, toUsers] = await Promise.all([
    renderEventReportPdf(eventId),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { outcome: true, config: true } }),
    prisma.socialPost.findMany({ where: { eventId, url: { not: null }, OR: [{ status: "POSTED" }, { featured: true }] }, select: { platform: true, url: true, authorName: true } }),
    prisma.linkedInPost.findMany({ where: { eventId, status: "POSTED", postUrl: { not: null } }, select: { postUrl: true, user: { select: { name: true } } } }),
    prisma.user.findMany({ where: { email: { in: cfg.to } }, select: { name: true } }),
  ]);
  const n = (fresh.outcome ?? {}) as Numbers;
  const cfgNums = (fresh.config ?? {}) as { participants?: number };
  const base = await brandBaseUrl(event.tenantId);
  const where = event.mode === "ONLINE" ? "Online" : [event.venue, event.campuses.map((c) => c.campus.name).join(", ")].filter(Boolean).join(", ");
  const type = event.category?.name ?? EVENT_TYPE_LABELS[event.type];
  const r = n.registrations ?? {};
  const fb = n.feedback ?? {};
  const first = toUsers.length === 1 ? toUsers[0].name.split(" ")[0] : "all";

  const lines: string[] = [];
  lines.push(`Hi ${first},`, "", `Here is the outcome report for ${event.title} (${type}), held ${fmtDate(event.startsAt)}${where ? ` at ${where}` : ""}. The full report is attached as a PDF.`);
  if (summary) {
    lines.push("", `${summary.headline}`, summary.summary);
  }
  lines.push("", "Key numbers");
  const nums = [
    r.registered ? `Registered: ${r.registered}` : cfgNums.participants ? `Participants: ${cfgNums.participants}` : null,
    r.attended ? `Attended: ${r.attended}${r.attendanceRate ? ` (${Math.round(r.attendanceRate)}%)` : ""}` : null,
    n.teams?.total ? `Teams: ${n.teams.total}` : null,
    fb.responses ? `Feedback: ${fb.avgRating ?? "–"}/5 from ${fb.responses} responses${fb.avgNps != null ? `, would recommend ${fb.avgNps}/10` : ""}` : "Feedback: none received",
    n.certificates?.issued ? `Certificates issued: ${n.certificates.issued}` : null,
    n.linkedin?.posted ? `Participants posted on LinkedIn: ${n.linkedin.posted}` : null,
    n.tasks?.total ? `Checklist: ${n.tasks.done ?? 0} of ${n.tasks.total} tasks done` : null,
  ].filter(Boolean) as string[];
  lines.push(...nums.map((x) => `• ${x}`));
  const aspects = Object.entries(fb.aspects ?? {});
  if (aspects.length) lines.push(...aspects.map(([k, v]) => `• ${ASPECT[k] ?? k}: ${v}/5`));
  if (n.teams?.winners?.length) lines.push("", "Winners", ...n.teams.winners.slice(0, 5).map((w) => `• ${w.award ? `${w.award.replace(/_/g, " ").toLowerCase()}: ` : ""}${w.team}`));
  if (summary?.feedbackPoints?.length) lines.push("", "What participants said", ...summary.feedbackPoints.map((x) => `• ${x}`));
  if (summary?.highlights.length) lines.push("", "What went well", ...summary.highlights.map((x) => `• ${x}`));
  if (summary?.concerns.length) lines.push("", "What fell short", ...summary.concerns.map((x) => `• ${x}`));
  if (summary?.recommendations.length) lines.push("", "Next time", ...summary.recommendations.map((x) => `• ${x}`));
  const links = [
    ...social.map((s) => `• ${s.platform.charAt(0) + s.platform.slice(1).toLowerCase()}${s.authorName ? ` (${s.authorName})` : ""}: ${s.url}`),
    ...linkedin.map((l) => `• LinkedIn (${l.user.name}): ${l.postUrl}`),
  ];
  lines.push("", "Social media", ...(links.length ? links.slice(0, 15) : ["• No posts recorded yet"]));
  lines.push("", `Open the report online: ${base}/admin/events/${event.id}?tab=report`);

  const subject = `Event report: ${event.title}`;
  const text = lines.join("\n");
  await sendEmail({
    from: fromAddress(event.tenant),
    to: cfg.to.join(", "),
    ...(cfg.cc.length && { cc: cfg.cc.filter((c) => !cfg.to.includes(c)) }),
    subject,
    text,
    html: await renderEmailHtml(event.tenant, subject, text, { label: "Open the full report", url: `${base}/admin/events/${event.id}?tab=report` }),
    attachments: [{ filename, content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  await logActivity(event.id, null, "report.sent", { to: cfg.to, cc: cfg.cc });
  return { to: cfg.to, cc: cfg.cc };
}
