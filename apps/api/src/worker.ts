import { announceDueEvents } from "./lib/audience";
import { requestFeedbackDue, sendReportsDue } from "./lib/afterEvent";
import { syncStudentsIfDue } from "./lib/studentSync";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "./plugins/prisma";
import { sendEmail } from "./lib/mailer";
import { enqueue, eventLinks, fmtDate, fromAddress, notifyGuest, renderEmailHtml } from "./lib/notify";
import { expireDuePayments } from "./lib/payments";

/**
 * In-process worker:
 *  - every 30 s: expires unpaid orders past their 30-minute hold (frees the seats), then sends due PENDING email
 *    notifications (3 attempts, then FAILED)
 *  - every 5 min: schedules reminders (24 h / 1 h before events, guest profile reminders, daily overdue-task digest)
 * Everything it schedules carries a dedupKey, so running it repeatedly (or after a restart) never duplicates messages.
 * With several API instances, run it on one only (WORKER=off on the others) — or move to pg-boss as planned.
 */
const SEND_EVERY_MS = 30_000;
const SCHEDULE_EVERY_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const HOUR = 60 * 60 * 1000;

export async function sendDueNotifications(log?: FastifyBaseLogger): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: "PENDING", channel: "EMAIL", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: 50,
    include: { tenant: true },
  });
  for (const n of due) {
    // Claim the row so a second worker can't send it at the same time.
    const claimed = await prisma.notification.updateMany({
      where: { id: n.id, status: "PENDING", attempts: n.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      const data = (n.data ?? {}) as { ctaLabel?: string; ctaUrl?: string; cc?: string[] };
      const result = await sendEmail({
        from: fromAddress(n.tenant),
        to: n.toEmail!,
        ...(data.cc?.length && { cc: data.cc }),
        subject: n.subject,
        text: data.ctaUrl && !n.body.includes(data.ctaUrl) ? `${n.body}\n\n${data.ctaLabel ?? "Open"}: ${data.ctaUrl}` : n.body,
        html: await renderEmailHtml(n.tenant, n.subject, n.body, { label: data.ctaLabel, url: data.ctaUrl }),
      });
      await prisma.notification.update({
        where: { id: n.id },
        data: result.status === "SENT" ? { status: "SENT", sentAt: new Date(), error: null } : { status: "SKIPPED", error: result.reason },
      });
    } catch (err) {
      const attempts = n.attempts + 1;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          error: String((err as Error).message ?? err).slice(0, 500),
          ...(attempts >= MAX_ATTEMPTS
            ? { status: "FAILED" }
            : { scheduledFor: new Date(Date.now() + attempts * 5 * 60_000) }), // back off 5, 10 min
        },
      });
      log?.warn({ err, notificationId: n.id, attempts }, "email send failed");
    }
  }
  return due.length;
}

const UPCOMING = ["ANNOUNCED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE"] as const;

/** Reminder times before an event, in hours (brand setting; default 24 h and 1 h). */
export function reminderHoursOf(settings: unknown): number[] {
  const h = ((settings ?? {}) as { notifications?: { reminderHours?: unknown } }).notifications?.reminderHours;
  const list = Array.isArray(h) ? h.map(Number).filter((x) => Number.isFinite(x) && x > 0 && x <= 24 * 14) : [24, 1];
  return [...new Set(list)].sort((a, b) => b - a);
}

function reminderWording(hours: number) {
  if (hours >= 48) return { subject: `In ${Math.round(hours / 24)} days`, when: `in ${Math.round(hours / 24)} days` };
  if (hours >= 24) return { subject: "Tomorrow", when: "in less than 24 hours" };
  if (hours > 1) return { subject: `In ${hours} hours`, when: `in about ${hours} hours` };
  return { subject: "Starting soon", when: "within the hour" };
}

export async function scheduleReminders(now = new Date()): Promise<void> {
  // Event reminders at the brand's chosen times before the start (default 24 h and 1 h).
  const tenants = new Map((await prisma.tenant.findMany({ select: { id: true, settings: true } })).map((t) => [t.id, reminderHoursOf(t.settings)]));
  const longest = Math.max(24, ...[...tenants.values()].flat());
  const events = await prisma.event.findMany({
    where: { status: { in: [...UPCOMING] }, remindersEnabled: true, startsAt: { gt: now, lte: new Date(now.getTime() + longest * HOUR) } },
  });
  for (const e of events) {
    const lead = e.startsAt.getTime() - now.getTime();
    const hours = tenants.get(e.tenantId) ?? [24, 1];
    // The closest reminder time that has been reached (e.g. 20 h before → the 24 h reminder).
    const due = [...hours].sort((a, b) => a - b).find((h) => lead <= h * HOUR);
    if (due == null) continue;
    const kind = `${due}h`;
    const w = reminderWording(due);
    const regs = await prisma.registration.findMany({
      where: { eventId: e.id, status: { in: ["REGISTERED", "APPROVED"] } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!regs.length) continue;
    const links = await eventLinks(e);
    const place = e.mode === "ONLINE" ? `Join online: ${e.meetingUrl ?? links.page}` : e.venue ? `Venue: ${e.venue}` : "";
    for (const r of regs) {
      await enqueue({
        tenantId: e.tenantId, eventId: e.id, userId: r.user.id, channels: ["EMAIL", "IN_APP"],
        template: `event.reminder.${kind}`,
        subject: `${w.subject}: ${e.title}`,
        body: `Hi ${r.user.name},\n\nA reminder that ${e.title} starts ${w.when}: ${fmtDate(e.startsAt)}.\n${place}\n\nKeep your ticket QR code ready for check-in.`,
        ctaLabel: "View my ticket", ctaUrl: links.me, dedupKey: `event.reminder.${kind}:${r.id}`,
      });
    }
  }

  // "New event, register now" emails to each newly announced event's audience.
  await announceDueEvents(now);
  // After the event: feedback request (~2 h after the end), then the outcome report to leadership.
  await requestFeedbackDue(now);
  await sendReportsDue(now);
  // Student list refresh from the student database (monthly).
  await syncStudentsIfDue();

  // Guest reminder: 2 days before, guests who were invited but haven't filled in their details.
  const guests = await prisma.eventGuest.findMany({
    where: {
      status: { in: ["INVITED", "CONFIRMED"] },
      profileSubmittedAt: null,
      email: { not: null },
      event: { status: { in: [...UPCOMING] }, startsAt: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) } },
    },
    select: { id: true },
  });
  for (const g of guests) await notifyGuest(g.id, "guest.reminder");

  // Daily overdue-task digest per assignee (one per assignee per day per brand).
  const overdue = await prisma.eventTask.findMany({
    where: {
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      dueAt: { lt: now },
      assigneeId: { not: null },
      // Drafts have tentative dates, so their checklist isn't overdue yet.
      event: { status: { notIn: ["DRAFT", "COMPLETED", "ARCHIVED", "CANCELLED"] } },
    },
    include: { event: { select: { id: true, title: true, tenantId: true } } },
    orderBy: { dueAt: "asc" },
  });
  const groups = new Map<string, typeof overdue>();
  for (const t of overdue) {
    const key = `${t.event.tenantId}|${t.assigneeId}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const day = now.toISOString().slice(0, 10);
  for (const [key, tasks] of groups) {
    const [tenantId, userId] = key.split("|");
    const lines = tasks.slice(0, 20).map((t) => `• ${t.title} — ${t.event.title} (due ${fmtDate(t.dueAt!)})`);
    const links = await eventLinks({ id: tasks[0].event.id, tenantId, slug: "" });
    await enqueue({
      tenantId, userId, channels: ["EMAIL", "IN_APP"], template: "task.overdue",
      subject: `${tasks.length} overdue event task${tasks.length === 1 ? "" : "s"}`,
      body: `These checklist items are past their due date:\n\n${lines.join("\n")}${tasks.length > 20 ? `\n…and ${tasks.length - 20} more` : ""}`,
      ctaLabel: "Open my tasks", ctaUrl: `${links.base}/admin/tasks`, dedupKey: `task.overdue:${tenantId}:${userId}:${day}`,
    });
  }
}

export function startWorker(log: FastifyBaseLogger): () => void {
  if (process.env.WORKER === "off") {
    log.info("notification worker disabled (WORKER=off)");
    return () => {};
  }
  let sending = false;
  let scheduling = false;
  const send = async () => {
    if (sending) return;
    sending = true;
    try {
      const expired = await expireDuePayments();
      if (expired) log.info({ expired }, "expired unpaid payments");
      await sendDueNotifications(log);
    } catch (err) {
      log.error({ err }, "notification send loop failed");
    } finally {
      sending = false;
    }
  };
  const schedule = async () => {
    if (scheduling) return;
    scheduling = true;
    try {
      await scheduleReminders();
      await send();
    } catch (err) {
      log.error({ err }, "reminder scheduling failed");
    } finally {
      scheduling = false;
    }
  };
  const a = setInterval(send, SEND_EVERY_MS);
  const b = setInterval(schedule, SCHEDULE_EVERY_MS);
  setTimeout(schedule, 2_000);
  log.info("notification worker started");
  return () => {
    clearInterval(a);
    clearInterval(b);
  };
}
