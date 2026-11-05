import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Event } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canManageEvent, findEvent, requireUser } from "../lib/permissions";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { teamInviteCode } from "../lib/codes";
import { logActivity } from "../lib/activity";

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

  app.patch<{ Params: { teamId: string } }>("/teams/:teamId/submission", async (req) => {
    const { user } = requireUser(req);
    const team = await prisma.team.findUnique({ where: { id: req.params.teamId }, include: { event: true, members: true } });
    if (!team || team.event.tenantId !== requireTenant(req).id) throw notFound("Team");
    const isMember = team.members.some((m) => m.userId === user.id);
    if (!isMember && !(await canManageEvent(req, team.event))) throw forbidden("Only team members can edit the submission");
    if (["JUDGING", "COMPLETED", "ARCHIVED", "CANCELLED"].includes(team.event.status) && isMember) {
      throw badRequest("Submissions are closed");
    }
    const url = z.string().url().nullable().optional();
    const body = z
      .object({
        projectTitle: z.string().max(120).optional(),
        projectSummary: z.string().max(4000).optional(),
        repoUrl: url,
        demoUrl: url,
        deckUrl: url,
        videoUrl: url,
        submit: z.boolean().optional(),
      })
      .parse(req.body);
    const { submit, ...fields } = body;
    const min = ((team.event.config ?? {}) as TeamConfig).minTeamSize ?? 1;
    if (submit && team.members.length < min) throw badRequest(`Teams need at least ${min} members to submit`);
    if (submit && !(fields.projectTitle ?? team.projectTitle)) throw badRequest("Add a project title before submitting");

    const updated = await prisma.team.update({
      where: { id: team.id },
      data: { ...fields, ...(submit && { submittedAt: new Date() }) },
      include: memberInclude,
    });
    if (submit) await logActivity(team.eventId, user.id, "team.submitted", { teamId: team.id, name: team.name });
    return updated;
  });

  /** Staff edits: rename, change track. */
  app.patch<{ Params: { teamId: string } }>("/teams/:teamId", async (req) => {
    requireUser(req);
    const team = await prisma.team.findUnique({ where: { id: req.params.teamId }, include: { event: true } });
    if (!team || team.event.tenantId !== requireTenant(req).id) throw notFound("Team");
    if (!(await canManageEvent(req, team.event))) throw forbidden();
    const body = z.object({ name: z.string().min(2).optional(), trackId: z.string().nullable().optional() }).parse(req.body);
    return prisma.team.update({ where: { id: team.id }, data: body });
  });
}
