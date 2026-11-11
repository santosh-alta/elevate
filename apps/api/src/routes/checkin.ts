import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Event } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { canCheckIn, canManageEvent, findEvent, requireBrandAdmin, requireEventManager, requireStaff, requireUser } from "../lib/permissions";
import { brandTicketDesign, eventTicketDesign, ticketDesignSchema, ticketTemplatePdf } from "../lib/ticketDesign";
import type { Prisma } from "@prisma/client";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { renderTicketPdf, shortTicket } from "../lib/ticket";

/**
 * Check-in desk on the website (works in any phone browser, no app needed):
 * search by name / email / phone / ticket number, check in a whole team, undo a mistake.
 * Scanning a QR code uses the existing POST /checkin.
 */
const ACTIVE = ["REGISTERED", "APPROVED", "WAITLISTED", "CHECKED_IN", "NO_SHOW"] as const;

async function requireDesk(req: FastifyRequest, idOrSlug: string): Promise<Event> {
  requireUser(req);
  const event = await findEvent(req, idOrSlug);
  if (!(await canCheckIn(req, event))) throw forbidden("You're not a volunteer or manager for this event");
  return event;
}

/** Team of a person at an event, with how many members are checked in. */
async function teamInfo(eventId: string, userId: string) {
  const m = await prisma.teamMember.findFirst({ where: { userId, team: { eventId } }, include: { team: { include: { members: { select: { userId: true } } } } } });
  if (!m) return null;
  const ids = m.team.members.map((x) => x.userId);
  const checkedIn = await prisma.registration.count({ where: { eventId, userId: { in: ids }, status: "CHECKED_IN" } });
  return { id: m.team.id, name: m.team.name, members: ids.length, checkedIn };
}

export function checkinRoutes(app: FastifyInstance) {
  /** Who is this event's check-in desk for, plus the live count. */
  app.get<{ Params: { id: string } }>("/events/:id/checkin/desk", async (req) => {
    const event = await requireDesk(req, req.params.id);
    const groups = await prisma.registration.groupBy({ by: ["status"], where: { eventId: event.id }, _count: true });
    const get = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
    return {
      event: { id: event.id, slug: event.slug, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, venue: event.venue, mode: event.mode },
      checkedIn: get("CHECKED_IN"),
      expected: get("APPROVED") + get("REGISTERED") + get("CHECKED_IN") + get("NO_SHOW"),
      waitlisted: get("WAITLISTED"),
      canUndo: await canManageEvent(req, event),
    };
  });

  /** Manual mode: find people by name, email, phone or ticket number. */
  app.get<{ Params: { id: string } }>("/events/:id/checkin/search", async (req) => {
    const event = await requireDesk(req, req.params.id);
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(req.query);
    const term = q.replace(/^#/, "");
    const regs = await prisma.registration.findMany({
      where: {
        eventId: event.id,
        status: { in: [...ACTIVE] },
        OR: [
          { user: { name: { contains: term, mode: "insensitive" } } },
          { user: { email: { contains: term, mode: "insensitive" } } },
          { user: { phone: { contains: term.replace(/\s+/g, "") } } },
          { ticketCode: { endsWith: term.toLowerCase() } },
          { ticketCode: term },
        ],
      },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { user: { name: "asc" } },
      take: 20,
    });
    const teams = await prisma.teamMember.findMany({
      where: { userId: { in: regs.map((r) => r.userId) }, team: { eventId: event.id } },
      include: { team: { select: { id: true, name: true } } },
    });
    const teamOf = new Map(teams.map((t) => [t.userId, t.team]));
    return regs.map((r) => ({
      id: r.id, ticketCode: r.ticketCode, shortCode: shortTicket(r.ticketCode), status: r.status, checkedInAt: r.checkedInAt,
      user: r.user, team: teamOf.get(r.userId) ?? null,
    }));
  });

  /** Check in every member of a team who has a registration (e.g. the leader arrives with the whole team). */
  app.post("/checkin/team", async (req) => {
    const auth = requireUser(req);
    const { eventId, teamId } = z.object({ eventId: z.string(), teamId: z.string() }).parse(req.body);
    const event = await requireDesk(req, eventId);
    const team = await prisma.team.findFirst({ where: { id: teamId, eventId: event.id }, include: { members: { select: { userId: true } } } });
    if (!team) throw notFound("Team");
    const regs = await prisma.registration.findMany({
      where: { eventId: event.id, userId: { in: team.members.map((m) => m.userId) }, status: { in: ["REGISTERED", "APPROVED", "WAITLISTED", "NO_SHOW"] } },
      include: { user: { select: { name: true } } },
    });
    if (regs.length) {
      await prisma.registration.updateMany({ where: { id: { in: regs.map((r) => r.id) } }, data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: auth.user.id } });
      await logActivity(event.id, auth.user.id, "checkin.team", { team: team.name, count: regs.length });
    }
    const checkedInCount = await prisma.registration.count({ where: { eventId: event.id, status: "CHECKED_IN" } });
    return { team: { id: team.id, name: team.name, members: team.members.length }, checkedInNow: regs.map((r) => r.user.name), checkedInCount };
  });

  /** Undo a check-in made by mistake (event managers only). */
  app.post("/checkin/undo", async (req) => {
    const auth = requireUser(req);
    const { registrationId } = z.object({ registrationId: z.string() }).parse(req.body);
    const reg = await prisma.registration.findUnique({ where: { id: registrationId }, include: { event: true, user: { select: { name: true } } } });
    if (!reg || reg.event.tenantId !== requireTenant(req).id) throw notFound("Registration");
    if (!(await canManageEvent(req, reg.event))) throw forbidden("Only the event's managers can undo a check-in");
    if (reg.status !== "CHECKED_IN") throw badRequest("This person isn't checked in");
    await prisma.registration.update({ where: { id: reg.id }, data: { status: reg.event.requiresApproval ? "APPROVED" : "REGISTERED", checkedInAt: null, checkedInById: null } });
    await logActivity(reg.eventId, auth.user.id, "checkin.undo", { name: reg.user.name });
    return { ok: true };
  });

  /** Team info for a scanned ticket, so the desk can offer "check in the whole team". */
  app.get<{ Params: { id: string; userId: string } }>("/events/:id/checkin/team-of/:userId", async (req) => {
    const event = await requireDesk(req, req.params.id);
    return (await teamInfo(event.id, req.params.userId)) ?? { id: null };
  });

  // ── Ticket designs: the standard ticket, or your own artwork with the details printed on it ──

  app.get("/ticket-design/guide.pdf", async (req, reply) => {
    const pdf = await ticketTemplatePdf(requireTenant(req).name);
    return reply.type("application/pdf").header("Content-Disposition", 'attachment; filename="ticket-design-template.pdf"').send(Buffer.from(pdf));
  });

  app.get("/ticket-design", async (req) => {
    requireStaff(req);
    return { design: brandTicketDesign(requireTenant(req).settings) };
  });

  app.put("/ticket-design", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const { design } = z.object({ design: ticketDesignSchema.nullable() }).parse(req.body);
    const fresh = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { settings: true } });
    const settings = { ...((fresh.settings ?? {}) as Record<string, unknown>) };
    if (design) settings.ticketDesign = design; else delete settings.ticketDesign;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
    return { design };
  });

  app.get<{ Params: { id: string } }>("/events/:id/ticket-design", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return { event: eventTicketDesign(event.config), brand: brandTicketDesign(requireTenant(req).settings) };
  });

  app.put<{ Params: { id: string } }>("/events/:id/ticket-design", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    const { design } = z.object({ design: ticketDesignSchema.nullable() }).parse(req.body);
    const config = { ...((event.config ?? {}) as Record<string, unknown>) };
    if (design) config.ticketDesign = design; else delete config.ticketDesign;
    await prisma.event.update({ where: { id: event.id }, data: { config: config as Prisma.InputJsonValue } });
    return { design };
  });

  /** A sample ticket (made-up attendee) with the saved design. Nothing is stored. */
  app.get("/ticket-design/preview.pdf", async (req, reply) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const { eventId } = z.object({ eventId: z.string().optional() }).parse(req.query);
    const full = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    const base = eventId ? await requireEventManager(req, eventId) : null;
    const event = base
      ? await prisma.event.findUniqueOrThrow({ where: { id: base.id }, include: { campuses: { select: { campus: { select: { name: true } } } } } })
      : ({ id: "sample", tenantId: tenant.id, title: "Sample Event 2026", type: "HACKATHON", mode: "OFFLINE", venue: "Main Auditorium", startsAt: new Date(Date.now() + 7 * 86_400_000), endsAt: new Date(Date.now() + 7 * 86_400_000 + 6 * 3_600_000), config: {}, campuses: [] } as never);
    const reg = {
      id: "preview", eventId: "sample", userId: "sample", status: "APPROVED", ticketCode: "samplepreview0000tz6v3h8n", answers: {},
      checkedInAt: null, checkedInById: null, addedById: null, paymentId: null, createdAt: new Date(),
      event: { ...(event as object), tenant: full }, user: { name: "Aarav Sharma", email: "aarav@example.com" },
    };
    const pdf = await renderTicketPdf(reg as never, "Byte Brigade");
    return reply.type("application/pdf").header("Content-Disposition", 'inline; filename="ticket-preview.pdf"').header("Cache-Control", "no-store").send(Buffer.from(pdf));
  });

  /** The person's ticket as a PDF (theirs, or for the event's staff). */
  app.get<{ Params: { ticketCode: string } }>("/registrations/:ticketCode/ticket.pdf", async (req, reply) => {
    const auth = requireUser(req);
    const reg = await prisma.registration.findUnique({
      where: { ticketCode: req.params.ticketCode },
      include: { event: { include: { tenant: true, campuses: { select: { campus: { select: { name: true } } } } } }, user: { select: { name: true, email: true } } },
    });
    if (!reg || reg.event.tenantId !== requireTenant(req).id) throw notFound("Ticket");
    if (reg.userId !== auth.user.id && !(await canCheckIn(req, reg.event))) throw forbidden();
    const team = await prisma.teamMember.findFirst({ where: { userId: reg.userId, team: { eventId: reg.eventId } }, include: { team: { select: { name: true } } } });
    const pdf = await renderTicketPdf(reg, team?.team.name ?? null);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `inline; filename="ticket-${reg.event.slug}.pdf"`)
      .header("Cache-Control", "private, no-store")
      .send(Buffer.from(pdf));
  });
}
