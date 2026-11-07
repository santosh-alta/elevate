import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Event } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canManageEvent, findEvent, requireUser } from "../lib/permissions";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { teamInviteCode } from "../lib/codes";
import { logActivity } from "../lib/activity";
import type { FastifyRequest } from "fastify";
import type { Payment, Prisma, RegistrationStatus } from "@prisma/client";
import { teamMemberInputSchema } from "@elevate/shared";
import { computeLeaderboard } from "../lib/judging";
import { findOrCreateMember, promoteWaitlist, seatsLeft } from "../lib/seats";
import { notifyRegistration, notifyTeamAdded, safely } from "../lib/notify";
import { PAYMENT_TTL_MS, attachOrder, getPaymentConfig, isPaidEvent, newReceiptNo, paymentResponse, priceFor } from "../lib/payments";

interface TeamConfig {
  minTeamSize?: number;
  maxTeamSize?: number;
  tracks?: { id: string; name: string }[];
}

const memberInclude = {
  members: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, linkedinUrl: true, githubUrl: true } } },
    orderBy: { joinedAt: "asc" as const },
  },
};

const url = z.string().url().nullable().optional();
const submissionShape = {
  projectTitle: z.string().trim().max(120).nullable().optional(),
  projectSummary: z.string().max(4000).nullable().optional(),
  repoUrl: url,
  demoUrl: url,
  deckUrl: url,
  videoUrl: url,
  techStack: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  attachments: z
    .array(z.object({ label: z.string().trim().min(1).max(120), url: z.string().url(), kind: z.enum(["link", "file"]).default("link") }))
    .max(20)
    .optional(),
};

function toTeamData(fields: Record<string, unknown>): Prisma.TeamUncheckedUpdateInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = k === "techStack" ? [...new Set(v as string[])] : v;
  return out as Prisma.TeamUncheckedUpdateInput;
}

async function loadTeam(req: FastifyRequest, teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { event: true, members: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  });
  if (!team || team.event.tenantId !== requireTenant(req).id) throw notFound("Team");
  return team;
}

type LoadedTeam = Awaited<ReturnType<typeof loadTeam>>;

/** Submission edits: only inside submissionsOpenAt..submissionsCloseAt (when set), before judging, and before submitting. Staff bypass. */
function assertSubmissionOpen(team: LoadedTeam, staff: boolean) {
  if (staff) return;
  const e = team.event;
  const now = new Date();
  if (["JUDGING", "COMPLETED", "ARCHIVED", "CANCELLED"].includes(e.status)) throw badRequest("Submissions are closed");
  if (e.submissionsOpenAt && now < e.submissionsOpenAt) throw badRequest("Submissions haven't opened yet");
  if (e.submissionsCloseAt && now > e.submissionsCloseAt) throw badRequest("Submissions have closed");
  if (team.submittedAt) throw badRequest("Your submission is locked — ask the organisers to unlock it");
}

function assertCanSubmit(team: LoadedTeam, title?: string | null) {
  const min = ((team.event.config ?? {}) as TeamConfig).minTeamSize ?? 1;
  if (team.members.length < min) throw badRequest(`Teams need at least ${min} members to submit`);
  if (!(title ?? team.projectTitle)) throw badRequest("Add a project title before submitting");
}

async function assertCanJoin(event: Event, userId: string) {
  const modules = (event.modules ?? {}) as Record<string, boolean>;
  if (!modules.teams) throw badRequest("This event doesn't use teams");
  if (!["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE"].includes(event.status)) throw badRequest("Team changes are closed for this event");
  const reg = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId } } });
  if (!reg || !["REGISTERED", "APPROVED", "CHECKED_IN"].includes(reg.status)) throw badRequest("Register for the event first");
  const already = await prisma.teamMember.findFirst({ where: { userId, team: { eventId: event.id } } });
  if (already) throw conflict("You're already in a team for this event");
}

export function teamRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/events/:id/teams", async (req) => {
    requireUser(req);
    const event = await findEvent(req, req.params.id);
    if (await canManageEvent(req, event)) {
      return prisma.team.findMany({ where: { eventId: event.id }, orderBy: { name: "asc" }, include: memberInclude });
    }
    // Participants see the list of teams without invite codes or contact details.
    const teams = await prisma.team.findMany({
      where: { eventId: event.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trackId: true, projectTitle: true, submittedAt: true, rank: true, award: true, _count: { select: { members: true } } },
    });
    return teams.map((t) => ({ ...t, award: event.resultsPublishedAt ? t.award : null, rank: event.resultsPublishedAt ? t.rank : null }));
  });

  app.post<{ Params: { id: string } }>("/events/:id/teams", async (req, reply) => {
    const { user } = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const body = z.object({ name: z.string().trim().min(2).max(60), trackId: z.string().optional() }).parse(req.body);
    await assertCanJoin(event, user.id);
    const config = (event.config ?? {}) as TeamConfig;
    if (body.trackId && config.tracks?.length && !config.tracks.some((t) => t.id === body.trackId)) throw badRequest("Unknown track");

    const team = await prisma.team.create({
      data: {
        eventId: event.id,
        name: body.name,
        trackId: body.trackId,
        inviteCode: teamInviteCode(),
        members: { create: { userId: user.id, isLeader: true } },
      },
      include: memberInclude,
    });
    await logActivity(event.id, user.id, "team.created", { teamId: team.id, name: team.name });
    return reply.status(201).send(team);
  });

  app.post("/teams/join", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const { inviteCode } = z.object({ inviteCode: z.string().trim().min(4) }).parse(req.body);
    const team = await prisma.team.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { event: true, _count: { select: { members: true } } },
    });
    if (!team || team.event.tenantId !== tenant.id) throw notFound("Team with that invite code");
    await assertCanJoin(team.event, user.id);
    const max = ((team.event.config ?? {}) as TeamConfig).maxTeamSize ?? 4;
    if (team._count.members >= max) throw badRequest(`Team is full (max ${max} members)`);
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });
    await logActivity(team.eventId, user.id, "team.joined", { teamId: team.id, name: team.name });
    return prisma.team.findUniqueOrThrow({ where: { id: team.id }, include: memberInclude });
  });

  app.delete<{ Params: { teamId: string } }>("/teams/:teamId/members/me", async (req) => {
    const { user } = requireUser(req);
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.params.teamId, userId: user.id } },
      include: { team: { include: { event: true, members: { orderBy: { joinedAt: "asc" } } } } },
    });
    if (!member || member.team.event.tenantId !== requireTenant(req).id) throw notFound("Team membership");
    if (member.team.submittedAt) throw badRequest("You can't leave a team after it has submitted");
    await prisma.teamMember.delete({ where: { teamId_userId: { teamId: member.teamId, userId: user.id } } });
    const remaining = member.team.members.filter((m) => m.userId !== user.id);
    if (!remaining.length) {
      await prisma.team.delete({ where: { id: member.teamId } });
    } else if (member.isLeader) {
      await prisma.teamMember.update({ where: { teamId_userId: { teamId: member.teamId, userId: remaining[0].userId } }, data: { isLeader: true } });
    }
    await logActivity(member.team.eventId, user.id, "team.left", { teamId: member.teamId });
    return { ok: true };
  });

  app.get("/me/teams", async (req) => {
    const { user } = requireUser(req);
    const tenant = requireTenant(req);
    const { eventId } = z.object({ eventId: z.string().optional() }).parse(req.query);
    return prisma.team.findMany({
      where: {
        event: { tenantId: tenant.id, ...(eventId && { OR: [{ id: eventId }, { slug: eventId }] }) },
        members: { some: { userId: user.id } },
      },
      include: { ...memberInclude, event: { select: { id: true, slug: true, title: true, status: true, config: true } } },
    });
  });

  /** Older submission endpoint (any member); same rules as PATCH /teams/:id. */
  app.patch<{ Params: { teamId: string } }>("/teams/:teamId/submission", async (req) => {
    const { user } = requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    const isMember = team.members.some((m) => m.userId === user.id);
    const staff = await canManageEvent(req, team.event);
    if (!isMember && !staff) throw forbidden("Only team members can edit the submission");
    const body = z.object({ ...submissionShape, submit: z.boolean().optional() }).parse(req.body);
    const { submit, ...fields } = body;
    assertSubmissionOpen(team, staff);
    if (submit) assertCanSubmit(team, fields.projectTitle);
    const updated = await prisma.team.update({
      where: { id: team.id },
      data: { ...toTeamData(fields), ...(submit && { submittedAt: new Date() }) },
      include: memberInclude,
    });
    if (submit) await logActivity(team.eventId, user.id, "team.submitted", { teamId: team.id, name: team.name });
    return updated;
  });

  /** Leader or staff: team details (name, track, problem statement) and the submission. */
  app.patch<{ Params: { teamId: string } }>("/teams/:teamId", async (req) => {
    const { user } = requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    const staff = await canManageEvent(req, team.event);
    const leader = team.members.some((m) => m.userId === user.id && m.isLeader);
    if (!leader && !staff) throw forbidden("Only the team leader can change the team");
    const body = z
      .object({
        name: z.string().trim().min(2).max(60).optional(),
        trackId: z.string().nullable().optional(),
        problemStatementId: z.string().nullable().optional(),
        ...submissionShape,
      })
      .parse(req.body);
    const { name, trackId, problemStatementId, ...submission } = body;
    if (Object.values(submission).some((v) => v !== undefined)) assertSubmissionOpen(team, staff);
    const config = (team.event.config ?? {}) as TeamConfig;
    if (trackId && config.tracks?.length && !config.tracks.some((t) => t.id === trackId)) throw badRequest("Unknown track");
    if (problemStatementId) {
      const ps = await prisma.problemStatement.findFirst({ where: { id: problemStatementId, eventId: team.eventId } });
      if (!ps || (!staff && ps.releaseAt && ps.releaseAt > new Date())) throw badRequest("Unknown problem statement");
    }
    if (name && name !== team.name && (await prisma.team.findUnique({ where: { eventId_name: { eventId: team.eventId, name } } }))) {
      throw conflict(`The team name "${name}" is taken`);
    }
    const updated = await prisma.team.update({
      where: { id: team.id },
      data: { ...(name && { name }), ...(trackId !== undefined && { trackId }), ...(problemStatementId !== undefined && { problemStatementId }), ...toTeamData(submission) },
      include: { ...memberInclude, problemStatement: true },
    });
    await logActivity(team.eventId, user.id, "team.updated", { teamId: team.id, fields: Object.keys(body) });
    return updated;
  });

  app.post<{ Params: { teamId: string } }>("/teams/:teamId/submit", async (req) => {
    const { user } = requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    const staff = await canManageEvent(req, team.event);
    if (!team.members.some((m) => m.userId === user.id) && !staff) throw forbidden("Only team members can submit");
    if (team.submittedAt) return prisma.team.findUniqueOrThrow({ where: { id: team.id }, include: memberInclude });
    assertSubmissionOpen(team, staff);
    assertCanSubmit(team);
    const updated = await prisma.team.update({ where: { id: team.id }, data: { submittedAt: new Date() }, include: memberInclude });
    await logActivity(team.eventId, user.id, "team.submitted", { teamId: team.id, name: team.name });
    return updated;
  });

  app.post<{ Params: { teamId: string } }>("/teams/:teamId/unsubmit", async (req) => {
    requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    if (!(await canManageEvent(req, team.event))) throw forbidden();
    const updated = await prisma.team.update({ where: { id: team.id }, data: { submittedAt: null }, include: memberInclude });
    await logActivity(team.eventId, req.auth!.user.id, "team.unsubmitted", { teamId: team.id, name: team.name });
    return updated;
  });

  /** Leader adds a member while registrations are open (like the registration flow). */
  app.post<{ Params: { teamId: string } }>("/teams/:teamId/members", async (req, reply) => {
    const { user } = requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    const event = team.event;
    const staff = await canManageEvent(req, event);
    if (!team.members.some((m) => m.userId === user.id && m.isLeader) && !staff) throw forbidden("Only the team leader can add members");
    if (event.status !== "REGISTRATION_OPEN") throw badRequest("Registrations are closed — teams can't change now");
    const input = teamMemberInputSchema.parse(req.body);
    const max = ((event.config ?? {}) as TeamConfig).maxTeamSize ?? 4;
    if (team.members.length >= max) throw badRequest(`Team is full (max ${max} members)`);
    const email = input.email.toLowerCase();
    if (team.members.some((m) => m.user.email.toLowerCase() === email)) throw badRequest(`${email} is already in this team`);
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const reg = await prisma.registration.findFirst({ where: { eventId: event.id, userId: existingUser.id, status: { notIn: ["CANCELLED", "REJECTED"] } } });
      if (reg) throw badRequest(`${email} is already registered for this event`);
    }

    const leaderId = team.members.find((m) => m.isLeader)?.userId ?? user.id;
    const paid = isPaidEvent(event);
    const left = await seatsLeft(event);
    if (paid && left < 1) throw conflict("This event is full");
    // The team's own payment (per-team fee) covers new members.
    const teamPayment = paid && event.feeType === "PER_TEAM"
      ? await prisma.payment.findFirst({ where: { teamId: team.id, status: { in: ["PAID", "CREATED"] } }, orderBy: { createdAt: "desc" } })
      : null;
    let status: RegistrationStatus = event.requiresApproval ? "REGISTERED" : "APPROVED";
    if (!paid && left < 1) status = "WAITLISTED";
    if (paid && !(teamPayment?.status === "PAID")) status = "PENDING_PAYMENT";
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: event.tenantId } });
    const payConfig = getPaymentConfig(tenant);
    const perPerson = paid && event.feeType === "PER_PERSON";
    if (perPerson && payConfig.mode === "NONE") throw badRequest("Online payments aren't set up for this brand yet");
    const receiptNo = perPerson ? await newReceiptNo() : null;

    const { member, registration, payment } = await prisma.$transaction(async (tx) => {
      const member = await findOrCreateMember(tx, event.tenantId, input);
      await tx.teamMember.deleteMany({ where: { userId: member.id, team: { eventId: event.id } } }); // stale rows from a cancelled registration
      let payment: Payment | null = null;
      if (perPerson && receiptNo) {
        const price = priceFor(event, 1);
        payment = await tx.payment.create({
          data: {
            eventId: event.id, userId: leaderId, teamId: team.id, provider: payConfig.mode === "RAZORPAY" ? "RAZORPAY" : "DEV",
            amount: price.gross, currency: event.currency, quantity: 1, receiptNo, expiresAt: new Date(Date.now() + PAYMENT_TTL_MS),
          },
        });
      }
      const paymentId = payment?.id ?? teamPayment?.id ?? null;
      const registration = await tx.registration.upsert({
        where: { eventId_userId: { eventId: event.id, userId: member.id } },
        create: { eventId: event.id, userId: member.id, status, addedById: leaderId, paymentId },
        update: { status, addedById: leaderId, paymentId, answers: {}, checkedInAt: null, checkedInById: null },
      });
      await tx.teamMember.create({ data: { teamId: team.id, userId: member.id } });
      return { member, registration, payment };
    });
    let withOrder = payment;
    if (payment) withOrder = await attachOrder(payment, payConfig);
    if (status !== "PENDING_PAYMENT") {
      if (status === "WAITLISTED") safely("registration", () => notifyRegistration(registration.id, "waitlisted"));
      else safely("team.added", () => notifyTeamAdded(registration.id));
    }
    await logActivity(event.id, user.id, "team.member_added", { teamId: team.id, userId: member.id, name: member.name });
    return reply.status(201).send({
      member: { id: member.id, name: member.name, email: member.email },
      registration,
      payment: withOrder ? await paymentResponse(withOrder) : null,
      team: await prisma.team.findUniqueOrThrow({ where: { id: team.id }, include: memberInclude }),
    });
  });

  /** Leader removes a member, or a member leaves. The leader can only leave an otherwise empty team. */
  app.delete<{ Params: { teamId: string; userId: string } }>("/teams/:teamId/members/:userId", async (req) => {
    const { user } = requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    const targetId = req.params.userId === "me" ? user.id : req.params.userId;
    const target = team.members.find((m) => m.userId === targetId);
    if (!target) throw notFound("Team member");
    const staff = await canManageEvent(req, team.event);
    const leader = team.members.some((m) => m.userId === user.id && m.isLeader);
    if (targetId !== user.id && !leader && !staff) throw forbidden("Only the team leader can remove members");
    if (target.isLeader && team.members.length > 1 && !staff) throw badRequest("The leader can't leave while the team has other members");
    if (team.submittedAt && !staff) throw badRequest("Members can't change after the team has submitted");

    await prisma.teamMember.delete({ where: { teamId_userId: { teamId: team.id, userId: targetId } } });
    const reg = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: team.eventId, userId: targetId } } });
    // People registered as part of a team lose their seat with it; teams formed after registering (JOIN_LATER) don't.
    if (reg && !["CANCELLED", "CHECKED_IN"].includes(reg.status) && (team.registeredAsTeam || reg.addedById)) {
      await prisma.registration.update({ where: { id: reg.id }, data: { status: "CANCELLED" } });
      if (reg.paymentId) {
        const open = await prisma.registration.count({ where: { paymentId: reg.paymentId, status: { not: "CANCELLED" } } });
        if (!open) await prisma.payment.updateMany({ where: { id: reg.paymentId, status: { in: ["CREATED", "FAILED"] } }, data: { status: "EXPIRED" } });
      }
    }
    const remaining = team.members.filter((m) => m.userId !== targetId);
    if (!remaining.length) await prisma.team.delete({ where: { id: team.id } });
    else if (target.isLeader) {
      await prisma.teamMember.update({ where: { teamId_userId: { teamId: team.id, userId: remaining[0].userId } }, data: { isLeader: true } });
    }
    await promoteWaitlist(team.eventId);
    await logActivity(team.eventId, user.id, targetId === user.id ? "team.left" : "team.member_removed", { teamId: team.id, userId: targetId });
    return { ok: true, teamDeleted: !remaining.length };
  });

  /** Team page: members, problem statement, payment status and (after a round with shareFeedback closes) anonymous feedback. */
  app.get<{ Params: { teamId: string } }>("/teams/:teamId", async (req) => {
    const { user } = requireUser(req);
    const team = await loadTeam(req, req.params.teamId);
    const staff = await canManageEvent(req, team.event);
    if (!team.members.some((m) => m.userId === user.id) && !staff) throw forbidden("Only team members can see this team");
    const [full, payment, rounds] = await Promise.all([
      prisma.team.findUniqueOrThrow({ where: { id: team.id }, include: { ...memberInclude, problemStatement: true } }),
      prisma.payment.findFirst({
        where: { teamId: team.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, amount: true, currency: true, receiptNo: true, expiresAt: true, paidAt: true, quantity: true, userId: true },
      }),
      prisma.judgingRound.findMany({ where: { eventId: team.eventId, shareFeedback: true, isOpen: false, closedAt: { not: null } }, orderBy: { sortOrder: "asc" } }),
    ]);
    const feedback = [];
    for (const r of rounds) {
      const row = (await computeLeaderboard(team.eventId, r.id)).find((x) => x.team.id === team.id);
      if (!row) continue;
      const reviews = await prisma.judgeReview.findMany({ where: { roundId: r.id, teamId: team.id, submittedAt: { not: null } } });
      feedback.push({
        roundId: r.id,
        roundName: r.name,
        averageScore: row.judgesScored ? row.avgWeighted : null,
        criteria: row.criteria.map((c) => ({ name: c.name, maxScore: c.maxScore, average: c.average })),
        comments: reviews.map((x) => x.comment).filter((c): c is string => !!c),
        tags: [...new Set(reviews.flatMap((x) => x.tags))],
      });
    }
    const { event } = team;
    return {
      ...full,
      event: { id: event.id, slug: event.slug, title: event.title, status: event.status, submissionsOpenAt: event.submissionsOpenAt, submissionsCloseAt: event.submissionsCloseAt, config: event.config },
      inviteCode: full.inviteCode,
      payment,
      feedback,
    };
  });
}
