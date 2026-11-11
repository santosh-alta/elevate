import type { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { computeLeaderboard, defaultRoundId } from "./judging";
import { revenueFor } from "./payments";
import { CATEGORY_SELECT, eventMeta } from "./tags";

/** Builds the outcome report for an event and caches it in Event.outcome. */
export async function buildOutcome(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { campuses: { include: { campus: true } }, category: CATEGORY_SELECT },
  });

  const [regByStatus, regByCampus, teams, feedback, media, social, certs, linkedin, expenses, tasks, guests] = await Promise.all([
    prisma.registration.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.$queryRaw<{ campus: string | null; count: bigint }[]>`
      SELECT c."name" AS campus, COUNT(*)::bigint AS count
      FROM "Registration" r
      JOIN "Event" e ON e."id" = r."eventId"
      LEFT JOIN "Membership" m ON m."userId" = r."userId" AND m."tenantId" = e."tenantId"
      LEFT JOIN "Campus" c ON c."id" = m."campusId"
      WHERE r."eventId" = ${eventId}
      GROUP BY c."name"
      ORDER BY count DESC`,
    prisma.team.findMany({ where: { eventId }, include: { _count: { select: { members: true } } } }),
    prisma.feedback.aggregate({ where: { eventId }, _avg: { rating: true, nps: true }, _count: true }),
    prisma.mediaAsset.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } }),
    prisma.socialPost.findMany({ where: { eventId } }),
    prisma.certificate.groupBy({ by: ["type"], where: { eventId, revokedAt: null }, _count: true }),
    prisma.linkedInPost.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.expense.aggregate({ where: { eventId }, _sum: { planned: true, actual: true } }),
    prisma.eventTask.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.eventGuest.findMany({ where: { eventId }, select: { name: true, designation: true, organization: true, status: true } }),
  ]);

  const count = (rows: { _count: number }[]) => rows.reduce((s, r) => s + r._count, 0);
  const statusCount = (s: string) => regByStatus.find((r) => r.status === s)?._count ?? 0;
  const registered = count(regByStatus.filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED"));
  const attended = statusCount("CHECKED_IN");

  const roundId = await defaultRoundId(eventId);
  const leaderboard = teams.length ? (await computeLeaderboard(eventId, roundId)).slice(0, 5) : [];
  const winners = teams.filter((t) => t.award).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((t) => ({ team: t.name, award: t.award, rank: t.rank }));

  const meta = eventMeta(event);
  // Keep the AI leadership summary when the numbers are rebuilt.
  const aiSummary = (event.outcome as { aiSummary?: unknown } | null)?.aiSummary;
  const outcome = {
    generatedAt: new Date().toISOString(),
    ...(aiSummary ? { aiSummary } : {}),
    ...meta,
    event: {
      id: event.id, title: event.title, type: event.type, status: event.status, mode: event.mode, scope: event.scope,
      startsAt: event.startsAt, endsAt: event.endsAt, campuses: event.campuses.map((c) => c.campus.name),
      ...meta,
    },
    registrations: {
      registered,
      attended,
      attendanceRate: registered ? Math.round((attended / registered) * 1000) / 10 : 0,
      byStatus: Object.fromEntries(regByStatus.map((r) => [r.status, r._count])),
      byCampus: regByCampus.map((r) => ({ campus: r.campus ?? "Unassigned", count: Number(r.count) })),
    },
    teams: {
      total: teams.length,
      participants: teams.reduce((s, t) => s + t._count.members, 0),
      submitted: teams.filter((t) => t.submittedAt).length,
      winners,
      leaderboard,
    },
    guests,
    feedback: {
      responses: feedback._count,
      avgRating: feedback._avg.rating ? Math.round(feedback._avg.rating * 10) / 10 : null,
      avgNps: feedback._avg.nps ? Math.round(feedback._avg.nps * 10) / 10 : null,
    },
    media: {
      driveFolderUrl: event.driveFolderUrl,
      items: media.length,
      byKind: media.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] ?? 0) + 1 }), {}),
    },
    social: {
      planned: social.length,
      posted: social.filter((s) => s.status === "POSTED").length,
      posts: social.map((s) => ({ platform: s.platform, status: s.status, url: s.url, metrics: s.metrics })),
    },
    certificates: {
      issued: count(certs),
      byType: Object.fromEntries(certs.map((c) => [c.type, c._count])),
    },
    linkedin: {
      drafts: count(linkedin),
      posted: linkedin.find((l) => l.status === "POSTED")?._count ?? 0,
      byStatus: Object.fromEntries(linkedin.map((l) => [l.status, l._count])),
    },
    budget: {
      planned: Number(expenses._sum.planned ?? 0),
      actual: Number(expenses._sum.actual ?? 0),
    },
    revenue: { ...(await revenueFor({ eventId })), currency: event.currency },
    tasks: {
      total: count(tasks),
      done: tasks.find((t) => t.status === "DONE")?._count ?? 0,
      byStatus: Object.fromEntries(tasks.map((t) => [t.status, t._count])),
    },
  };

  await prisma.event.update({
    where: { id: eventId },
    data: { outcome: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue },
  });
  return outcome;
}
