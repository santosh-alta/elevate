import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Event, Prisma } from "@prisma/client";
import { SPONSOR_TIERS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, canManageEvent, findEvent, isOrganizer, requireEventManager, requireStaff } from "../lib/permissions";
import { badRequest, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { eventPageUrl } from "../lib/brand";
import { COMPETITION_TYPES, CONTEST_TYPES, checklistFor, uniqueSlug } from "./events";
import { CATEGORY_SELECT, eventMeta } from "../lib/tags";
import { newToken } from "./guests";

const HIDDEN = ["DRAFT", "PLANNING"];

/**
 * Finds an event for public endpoints. On a brand domain it is scoped to the brand (id or slug);
 * without a brand (e.g. a calendar link in an email that points at the API) only the globally unique id works.
 */
async function findPublicEvent(req: FastifyRequest, idOrSlug: string, preview?: string): Promise<Event> {
  const event = req.tenant ? await findEvent(req, idOrSlug) : await prisma.event.findUnique({ where: { id: idOrSlug } });
  if (!event) throw notFound("Event");
  if ((HIDDEN.includes(event.status) || event.approvalStatus !== "APPROVED") && preview !== event.previewToken && !(await canManageEvent(req, event))) throw notFound("Event");
  return event;
}

// ───────── iCalendar ─────────

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Folds lines at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 character
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines start with a space
  }
  return out.join("\r\n ");
}

export function buildIcs(e: Event, url: string, brandName: string): string {
  const location = e.mode === "ONLINE" ? e.meetingUrl ?? url : [e.venue, e.mode === "HYBRID" ? e.meetingUrl : null].filter(Boolean).join(" / ");
  const description = [e.tagline, e.mode !== "OFFLINE" && e.meetingUrl ? `Join online: ${e.meetingUrl}` : null, `Details: ${url}`]
    .filter(Boolean)
    .join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Elevate//${icsEscape(brandName)}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@elevate`,
    `DTSTAMP:${icsDate(new Date())}`,
    `LAST-MODIFIED:${icsDate(e.updatedAt)}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    `URL:${url}`,
    `ORGANIZER;CN=${icsEscape(brandName)}:mailto:${e.contactEmail ?? "no-reply@elevate.app"}`,
    `STATUS:${e.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

const sponsorSchema = z.object({
  name: z.string().trim().min(1),
  logoUrl: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  tier: z.enum(SPONSOR_TIERS).optional(),
  sortOrder: z.number().int().optional(),
});

export function eventPageRoutes(app: FastifyInstance) {
  app.get<{ Params: { idOrSlug: string } }>("/events/:idOrSlug/calendar.ics", async (req, reply) => {
    const { preview } = z.object({ preview: z.string().optional() }).parse(req.query);
    const event = await findPublicEvent(req, req.params.idOrSlug, preview);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: event.tenantId } });
    const ics = buildIcs(event, await eventPageUrl(event), tenant.name);
    return reply
      .type("text/calendar; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${event.slug}.ics"`)
      .send(ics);
  });

  /** All events in a date range, every status, for the admin calendar. */
  app.get("/events/calendar", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const now = new Date();
    const q = z
      .object({
        from: z.coerce.date().default(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: z.coerce.date().default(new Date(now.getFullYear(), now.getMonth() + 2, 0)),
        campusId: z.string().optional(),
      })
      .parse(req.query);
    if (q.to.getTime() - q.from.getTime() > 400 * 24 * 3600 * 1000) throw badRequest("Pick a range of at most 400 days");
    const events = await prisma.event.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { lte: q.to },
        endsAt: { gte: q.from },
        ...(q.campusId && { OR: [{ scope: "CENTRAL" }, { campuses: { some: { campusId: q.campusId } } }] }),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true, slug: true, title: true, type: true, status: true, scope: true, mode: true, startsAt: true, endsAt: true, venue: true,
        tags: true, category: CATEGORY_SELECT,
        campuses: { select: { campus: { select: { id: true, name: true, code: true } } } },
        _count: { select: { registrations: true } },
      },
    });
    return events.map((e) => ({ ...e, ...eventMeta(e) }));
  });

  /** Copies an event into a new DRAFT: details, form, rubric, sessions, sponsors and guests (as PROPOSED), with a fresh checklist. */
  app.post<{ Params: { id: string } }>("/events/:id/clone", async (req, reply) => {
    const src = await requireEventManager(req, req.params.id);
    const body = z
      .object({ title: z.string().trim().min(3).optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional() })
      .parse(req.body ?? {});
    const startsAt = body.startsAt ?? src.startsAt;
    const shift = startsAt.getTime() - src.startsAt.getTime();
    const endsAt = body.endsAt ?? new Date(src.endsAt.getTime() + shift);
    if (endsAt < startsAt) throw badRequest("endsAt must be after startsAt");
    const move = (d: Date | null) => (d ? new Date(d.getTime() + shift) : null);
    const title = body.title ?? `${src.title} (copy)`;

    const full = await prisma.event.findUniqueOrThrow({
      where: { id: src.id },
      include: { campuses: true, rubric: true, rounds: true, sessions: true, sponsors: true, guests: true },
    });
    const isCompetition = COMPETITION_TYPES.includes(src.type) || CONTEST_TYPES.includes(src.type);
    const event = await prisma.event.create({
      data: {
        tenantId: src.tenantId,
        slug: await uniqueSlug(src.tenantId, title),
        previewToken: newToken(),
        title,
        tagline: src.tagline, description: src.description, type: src.type, scope: src.scope, mode: src.mode, status: "DRAFT",
        coverImageUrl: src.coverImageUrl, venue: src.venue, meetingUrl: src.meetingUrl, livestreamUrl: src.livestreamUrl,
        venueMapUrl: src.venueMapUrl, contactEmail: src.contactEmail, contactPhone: src.contactPhone,
        startsAt, endsAt,
        registrationOpensAt: move(src.registrationOpensAt), registrationClosesAt: move(src.registrationClosesAt),
        capacity: src.capacity, requiresApproval: src.requiresApproval,
        modules: src.modules as Prisma.InputJsonValue, config: src.config as Prisma.InputJsonValue,
        registrationForm: src.registrationForm as Prisma.InputJsonValue, faqs: src.faqs as Prisma.InputJsonValue,
        pageSections: src.pageSections as Prisma.InputJsonValue, parentEventId: src.parentEventId,
        feeAmount: src.feeAmount, currency: src.currency, feeType: src.feeType, earlyBirdAmount: src.earlyBirdAmount,
        earlyBirdEndsAt: move(src.earlyBirdEndsAt), submissionsOpenAt: move(src.submissionsOpenAt), submissionsCloseAt: move(src.submissionsCloseAt),
        categoryId: src.categoryId, tags: src.tags,
        clonedFromId: src.id,
        createdById: req.auth!.user.id,
        // A copy made by an organizer needs its own approval and stays free like any organizer event.
        ...(isOrganizer(req) && { approvalStatus: "DRAFT" as const, paidAllowed: false, feeAmount: null, earlyBirdAmount: null }),
        campuses: { create: full.campuses.map((c) => ({ campusId: c.campusId })) },
        staff: { create: [{ userId: req.auth!.user.id, role: "MANAGER" }] },
        tasks: { create: await checklistFor(src.tenantId, src.type, startsAt) },
        rubric: {
          create: full.rubric.filter((c) => !c.roundId).map(({ name, description, maxScore, weight, sortOrder }) => ({ name, description, maxScore, weight, sortOrder })),
        },
        rounds: {
          create: full.rounds.length
            ? full.rounds.map(({ name, sortOrder, description, restrictTeams, shareFeedback }) => ({
                name, sortOrder, description, restrictTeams, shareFeedback, isOpen: false,
              }))
            : isCompetition ? [{ name: "Final", sortOrder: 0, isOpen: false }] : [],
        },
        sessions: {
          create: full.sessions.map(({ title: t, speaker, location, startsAt: s, endsAt: e }) => ({
            title: t, speaker, location, startsAt: move(s)!, endsAt: move(e)!,
          })),
        },
        sponsors: { create: full.sponsors.map(({ name, logoUrl, website, tier, sortOrder }) => ({ name, logoUrl, website, tier, sortOrder })) },
        guests: {
          create: full.guests
            .filter((g) => g.status !== "DECLINED")
            .map((g) => ({
              profileId: g.profileId, name: g.name, email: g.email, phone: g.phone, designation: g.designation, organization: g.organization,
              bio: g.bio, photoUrl: g.photoUrl, linkedinUrl: g.linkedinUrl, role: g.role, talkTitle: g.talkTitle, talkAbstract: g.talkAbstract,
              sessionAt: move(g.sessionAt), hostUserId: g.hostUserId, isPublic: g.isPublic, sortOrder: g.sortOrder,
              status: "PROPOSED" as const, portalToken: newToken(),
            })),
        },
      },
      include: { category: CATEGORY_SELECT },
    });
    // Round-specific criteria move with their (new) round.
    const roundCriteria = full.rubric.filter((c) => c.roundId);
    if (roundCriteria.length) {
      const newRounds = await prisma.judgingRound.findMany({ where: { eventId: event.id } });
      for (const c of roundCriteria) {
        const old = full.rounds.find((r) => r.id === c.roundId);
        const target = old && newRounds.find((r) => r.name === old.name && r.sortOrder === old.sortOrder);
        if (!target) continue;
        await prisma.rubricCriterion.create({
          data: { eventId: event.id, roundId: target.id, name: c.name, description: c.description, maxScore: c.maxScore, weight: c.weight, sortOrder: c.sortOrder },
        });
      }
    }
    await logActivity(event.id, req.auth!.user.id, "event.cloned", { from: src.id, fromTitle: src.title });
    await logActivity(src.id, req.auth!.user.id, "event.cloned_to", { to: event.id, title: event.title });
    return reply.status(201).send({ ...event, ...eventMeta(event) });
  });

  // ───────── Sponsors / partners ─────────
  app.get<{ Params: { id: string } }>("/events/:id/sponsors", async (req) => {
    const { preview } = z.object({ preview: z.string().optional() }).parse(req.query);
    const event = await findPublicEvent(req, req.params.id, preview);
    return prisma.sponsor.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  });

  app.post<{ Params: { id: string } }>("/events/:id/sponsors", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = sponsorSchema.parse(req.body);
    const sponsor = await prisma.sponsor.create({ data: { ...body, eventId: event.id } });
    await logActivity(event.id, req.auth!.user.id, "sponsor.added", { name: sponsor.name, tier: sponsor.tier });
    return reply.status(201).send(sponsor);
  });

  app.patch<{ Params: { sponsorId: string } }>("/sponsors/:sponsorId", async (req) => {
    const sponsor = await prisma.sponsor.findUnique({ where: { id: req.params.sponsorId }, include: { event: true } });
    if (!sponsor) throw notFound("Sponsor");
    await assertManageable(req, sponsor.event);
    const body = sponsorSchema.partial().parse(req.body);
    return prisma.sponsor.update({ where: { id: sponsor.id }, data: body });
  });

  app.delete<{ Params: { sponsorId: string } }>("/sponsors/:sponsorId", async (req) => {
    const sponsor = await prisma.sponsor.findUnique({ where: { id: req.params.sponsorId }, include: { event: true } });
    if (!sponsor) throw notFound("Sponsor");
    await assertManageable(req, sponsor.event);
    await prisma.sponsor.delete({ where: { id: sponsor.id } });
    return { ok: true };
  });
}
