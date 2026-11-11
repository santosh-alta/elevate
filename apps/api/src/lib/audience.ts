import type { Event, Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { enqueue, eventLinks, fmtDate } from "./notify";

/**
 * Who an event is for: campus (all, or the event's campuses), batches (enrolment years) and programs.
 * People come from the student list (synced from the student database) plus students who signed up here.
 * Each email address counts once.
 */
export type AudienceFilter = { tenantId: string; campusIds: string[] | null; batches: number[]; programs: string[] };
export type Person = { email: string; name: string; userId: string | null };

export function filterFor(event: Event & { campuses?: { campusId: string }[] }): AudienceFilter {
  return {
    tenantId: event.tenantId,
    campusIds: event.scope === "CAMPUS" ? (event.campuses ?? []).map((c) => c.campusId) : null,
    batches: event.audienceBatches ?? [],
    programs: event.audiencePrograms ?? [],
  };
}

export async function audience(f: AudienceFilter): Promise<Person[]> {
  // Passed-out students are left out even if they're still in the student database (graduation assumed by July).
  const now = new Date();
  const lastBatchOut = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const where: Prisma.StudentWhereInput = {
    tenantId: f.tenantId, active: true, email: { not: null },
    OR: [{ passingYear: null }, { passingYear: { gt: lastBatchOut } }],
    ...(f.campusIds && { campusId: { in: f.campusIds } }),
    ...(f.batches.length && { batch: { in: f.batches } }),
    ...(f.programs.length && { program: { in: f.programs, mode: "insensitive" } }),
  };
  const students = await prisma.student.findMany({ where, select: { email: true, name: true, userId: true } });
  const people = new Map<string, Person>();
  for (const s of students) people.set(s.email!.toLowerCase(), { email: s.email!.toLowerCase(), name: s.name, userId: s.userId });

  // Students who signed up here but aren't in the student list (only when no batch/program filter, since we
  // don't know theirs reliably).
  if (!f.batches.length && !f.programs.length) {
    const members = await prisma.membership.findMany({
      where: { tenantId: f.tenantId, role: "STUDENT", ...(f.campusIds && { campusId: { in: f.campusIds } }) },
      select: { user: { select: { id: true, email: true, name: true } } },
    });
    for (const m of members) {
      const e = m.user.email.toLowerCase();
      if (!people.has(e)) people.set(e, { email: e, name: m.user.name, userId: m.user.id });
    }
  }
  return [...people.values()];
}

/**
 * "New event, register now" email to the event's audience, once, when it becomes public.
 * Called by the worker every few minutes; marks the event first so it can never send twice.
 */
export async function announceDueEvents(now = new Date()): Promise<number> {
  const events = await prisma.event.findMany({
    where: {
      notifyOnAnnounce: true, announcedNotifiedAt: null, approvalStatus: "APPROVED",
      status: { in: ["ANNOUNCED", "REGISTRATION_OPEN"] }, startsAt: { gt: now },
    },
    include: { campuses: { select: { campusId: true, campus: { select: { name: true } } } } },
    take: 5,
  });
  let sent = 0;
  for (const e of events) {
    const claimed = await prisma.event.updateMany({ where: { id: e.id, announcedNotifiedAt: null }, data: { announcedNotifiedAt: now } });
    if (!claimed.count) continue;
    const people = await audience(filterFor(e));
    const links = await eventLinks(e);
    const where = e.mode === "ONLINE" ? "Online" : [e.venue, e.campuses.map((c) => c.campus.name).join(", ")].filter(Boolean).join(", ");
    const fee = e.feeAmount ? `Fee: ₹${(e.feeAmount / 100).toLocaleString("en-IN")}` : "Free to attend";
    const closes = e.registrationClosesAt ? `Register by ${fmtDate(e.registrationClosesAt)}.` : "Seats are limited, so register early.";
    for (const p of people) {
      await enqueue({
        tenantId: e.tenantId, eventId: e.id, userId: p.userId, toEmail: p.email, channels: p.userId ? ["EMAIL", "IN_APP"] : ["EMAIL"],
        template: "event.announced",
        subject: `New event: ${e.title}. Register now`,
        body: [
          `Hi ${p.name.split(" ")[0] || "there"},`,
          "",
          `${e.title} is open for registration${e.tagline ? `: ${e.tagline}` : "."}`,
          "",
          `When: ${fmtDate(e.startsAt)}`,
          where ? `Where: ${where}` : "",
          fee,
          "",
          closes,
        ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
        ctaLabel: "Register now", ctaUrl: links.page,
        dedupKey: `event.announced:${e.id}:${p.email}`,
      });
      sent++;
    }
  }
  return sent;
}

/**
 * "Registration closes soon" to people in an event's audience who haven't registered, at the brand's chosen times
 * before registration closes (or the event starts). Only for events whose announcement email was sent.
 */
export async function nudgeUnregistered(now = new Date()): Promise<number> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  let sent = 0;
  for (const t of tenants) {
    const hours = (((t.settings ?? {}) as { notifications?: { registerNudgeHours?: number[] } }).notifications?.registerNudgeHours ?? [])
      .map(Number).filter((h) => h > 0).sort((a, b) => a - b);
    if (!hours.length) continue;
    const events = await prisma.event.findMany({
      where: {
        tenantId: t.id, notifyOnAnnounce: true, announcedNotifiedAt: { not: null }, approvalStatus: "APPROVED",
        status: { in: ["ANNOUNCED", "REGISTRATION_OPEN"] }, startsAt: { gt: now },
      },
      include: { campuses: { select: { campusId: true } } },
    });
    for (const e of events) {
      const deadline = (e.registrationClosesAt && e.registrationClosesAt < e.startsAt ? e.registrationClosesAt : e.startsAt).getTime();
      const lead = deadline - now.getTime();
      if (lead <= 0) continue;
      const due = hours.find((h) => lead <= h * 3_600_000);
      if (due == null) continue;
      const registered = new Set((await prisma.registration.findMany({
        where: { eventId: e.id, status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { user: { select: { email: true } } },
      })).map((r) => r.user.email.toLowerCase()));
      const people = (await audience(filterFor(e))).filter((p) => !registered.has(p.email));
      const links = await eventLinks(e);
      const when = due >= 24 ? `in ${Math.round(due / 24)} day${due >= 48 ? "s" : ""}` : `in ${due} hour${due > 1 ? "s" : ""}`;
      for (const p of people) {
        const r = await enqueue({
          tenantId: e.tenantId, eventId: e.id, userId: p.userId, toEmail: p.email, channels: ["EMAIL"], template: "event.register_nudge",
          subject: `Registration closes ${when}: ${e.title}`,
          body: `Hi ${p.name.split(" ")[0] || "there"},\n\nRegistration for ${e.title} closes ${when}. It happens on ${fmtDate(e.startsAt)}.\n\nIf you'd like to join, register now.`,
          ctaLabel: "Register now", ctaUrl: links.page, dedupKey: `event.nudge.${due}:${e.id}:${p.email}`,
        });
        sent += r.length;
      }
    }
  }
  return sent;
}
