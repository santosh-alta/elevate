import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { EventGuest, GuestProfile, Prisma } from "@prisma/client";
import { GUEST_ROLES } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { assertManageable, requireEventManager, requireStaff } from "../lib/permissions";
import { badRequest, conflict, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { brandBaseUrl, themeOf } from "../lib/brand";
import { enqueue, notifyGuest } from "../lib/notify";
import { readUpload } from "../lib/multipart";
import { storeUpload } from "../lib/storage";
import { urlToken } from "../lib/codes";

const guestStatus = z.enum(["PROPOSED", "INVITED", "CONFIRMED", "DECLINED", "ARRIVED", "THANKED"]);
const url = z.string().url();
const optStr = z.string().trim().max(5000).nullable().optional();

/** Public-facing fields shared by GuestProfile and EventGuest. */
const PROFILE_FIELDS = ["name", "email", "phone", "designation", "organization", "bio", "photoUrl", "linkedinUrl"] as const;

const profileSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().nullable().optional(),
  phone: optStr,
  designation: optStr,
  organization: optStr,
  bio: optStr,
  photoUrl: url.nullable().optional(),
  linkedinUrl: url.nullable().optional(),
  websiteUrl: url.nullable().optional(),
  city: optStr,
  expertise: z.array(z.string().trim().min(1)).max(30).optional(),
  notes: optStr,
  affiliation: z.enum(["ALTA", "EXTERNAL"]).optional(),
});

const guestSchema = z.object({
  profileId: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: optStr,
  designation: optStr,
  organization: optStr,
  bio: optStr,
  photoUrl: url.nullable().optional(),
  linkedinUrl: url.nullable().optional(),
  role: z.enum(GUEST_ROLES).optional(),
  status: guestStatus.optional(),
  talkTitle: optStr,
  talkAbstract: optStr,
  sessionAt: z.coerce.date().nullable().optional(),
  hostUserId: z.string().nullable().optional(),
  arrivalAt: z.coerce.date().nullable().optional(),
  departureAt: z.coerce.date().nullable().optional(),
  travelNotes: optStr,
  stayDetails: optStr,
  dietary: optStr,
  avRequirements: optStr,
  consentRecording: z.boolean().nullable().optional(),
  honorarium: z.number().nonnegative().nullable().optional(),
  paymentStatus: z.enum(["NOT_APPLICABLE", "PENDING", "PAID"]).nullable().optional(),
  invoiceUrl: url.nullable().optional(),
  mementoGiven: z.boolean().optional(),
  documents: z.array(z.object({ name: z.string().min(1), url, kind: z.string().optional() })).max(50).optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const portalSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: optStr,
  designation: optStr,
  organization: optStr,
  bio: optStr,
  linkedinUrl: url.nullable().optional(),
  photoUrl: url.nullable().optional(),
  talkTitle: optStr,
  talkAbstract: optStr,
  arrivalAt: z.coerce.date().nullable().optional(),
  departureAt: z.coerce.date().nullable().optional(),
  dietary: optStr,
  avRequirements: optStr,
  consentRecording: z.boolean().nullable().optional(),
});

export const newToken = urlToken;

const lower = (e?: string | null) => (e ? e.toLowerCase() : e);

function pickProfileFields(src: Partial<Record<(typeof PROFILE_FIELDS)[number], unknown>>) {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** Finds the brand's profile for a guest (by email, else by a unique exact name), or creates one. */
async function findOrCreateProfile(tenantId: string, fields: Record<string, unknown>): Promise<GuestProfile> {
  const email = lower(fields.email as string | null | undefined);
  if (email) {
    const byEmail = await prisma.guestProfile.findFirst({ where: { tenantId, email } });
    if (byEmail) return byEmail;
  } else if (fields.name) {
    const byName = await prisma.guestProfile.findMany({
      where: { tenantId, email: null, name: { equals: fields.name as string, mode: "insensitive" } },
      take: 2,
    });
    if (byName.length === 1) return byName[0];
  }
  return prisma.guestProfile.create({
    data: { tenantId, ...(pickProfileFields(fields) as { name: string }), email: email ?? null },
  });
}

async function validateHost(tenantId: string, hostUserId?: string | null) {
  if (!hostUserId) return;
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: hostUserId } } });
  if (!m) throw badRequest("The point of contact must be a member of this brand");
}

async function loadGuest(req: FastifyRequest, guestId: string) {
  const guest = await prisma.eventGuest.findUnique({ where: { id: guestId }, include: { event: true } });
  if (!guest) throw notFound("Guest");
  await assertManageable(req, guest.event);
  return guest;
}

const hostSelect = { select: { id: true, name: true, email: true, phone: true } } as const;

/** Fields a guest may see about themselves on their portal. */
function portalView(g: EventGuest) {
  return {
    name: g.name, email: g.email, phone: g.phone, designation: g.designation, organization: g.organization, bio: g.bio,
    linkedinUrl: g.linkedinUrl, photoUrl: g.photoUrl, role: g.role, status: g.status, talkTitle: g.talkTitle,
    talkAbstract: g.talkAbstract, sessionAt: g.sessionAt, arrivalAt: g.arrivalAt, departureAt: g.departureAt,
    dietary: g.dietary, avRequirements: g.avRequirements, consentRecording: g.consentRecording,
    profileSubmittedAt: g.profileSubmittedAt,
  };
}

async function loadPortalGuest(req: FastifyRequest, token: string) {
  const guest = await prisma.eventGuest.findUnique({
    where: { portalToken: token },
    include: { event: { include: { tenant: true } }, host: hostSelect },
  });
  // On a brand domain, the token must belong to that brand.
  if (!guest || (req.tenant && guest.event.tenantId !== req.tenant.id)) throw notFound("Guest page");
  return guest;
}

export function guestRoutes(app: FastifyInstance) {
  // ───────── Brand guest library ─────────
  app.get("/guest-profiles", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const { q, affiliation } = z.object({ q: z.string().trim().optional(), affiliation: z.enum(["ALTA", "EXTERNAL"]).optional() }).parse(req.query);
    const profiles = await prisma.guestProfile.findMany({
      where: {
        tenantId: tenant.id,
        ...(affiliation && { affiliation }),
        // Former instructors (no longer teaching) are hidden unless searched for by name.
        ...(!q && { active: true }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { organization: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { expertise: { has: q } },
          ],
        }),
      },
      orderBy: [{ affiliation: "asc" }, { name: "asc" }],
      take: 300,
      include: {
        _count: { select: { appearances: true } },
        appearances: {
          orderBy: { event: { startsAt: "desc" } },
          take: 1,
          select: { role: true, status: true, event: { select: { id: true, slug: true, title: true, startsAt: true } } },
        },
      },
    });
    return profiles.map(({ appearances, _count, ...p }) => ({
      ...p,
      appearances: _count.appearances,
      lastEvent: appearances[0] ? { ...appearances[0].event, role: appearances[0].role, status: appearances[0].status } : null,
    }));
  });

  app.post("/guest-profiles", async (req, reply) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const body = profileSchema.parse(req.body);
    const email = lower(body.email);
    if (email && (await prisma.guestProfile.findFirst({ where: { tenantId: tenant.id, email } }))) {
      throw conflict("A guest with this email is already in the library");
    }
    const profile = await prisma.guestProfile.create({ data: { ...body, email, tenantId: tenant.id } });
    return reply.status(201).send(profile);
  });

  app.get<{ Params: { profileId: string } }>("/guest-profiles/:profileId", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const profile = await prisma.guestProfile.findFirst({
      where: { id: req.params.profileId, tenantId: tenant.id },
      include: {
        appearances: {
          orderBy: { event: { startsAt: "desc" } },
          include: { event: { select: { id: true, slug: true, title: true, type: true, status: true, startsAt: true } } },
        },
      },
    });
    if (!profile) throw notFound("Guest profile");
    return {
      ...profile,
      appearances: profile.appearances.map((a) => ({
        guestId: a.id, role: a.role, status: a.status, talkTitle: a.talkTitle, sessionAt: a.sessionAt, event: a.event,
      })),
    };
  });

  app.patch<{ Params: { profileId: string } }>("/guest-profiles/:profileId", async (req) => {
    requireStaff(req);
    const tenant = requireTenant(req);
    const profile = await prisma.guestProfile.findFirst({ where: { id: req.params.profileId, tenantId: tenant.id } });
    if (!profile) throw notFound("Guest profile");
    const body = profileSchema.partial().parse(req.body);
    const email = body.email === undefined ? undefined : lower(body.email);
    if (email && email !== profile.email && (await prisma.guestProfile.findFirst({ where: { tenantId: tenant.id, email } }))) {
      throw conflict("Another guest in the library uses this email");
    }
    return prisma.guestProfile.update({ where: { id: profile.id }, data: { ...body, ...(email !== undefined && { email }) } });
  });

  // ───────── Guests on an event ─────────
  app.get<{ Params: { id: string } }>("/events/:id/guests", async (req) => {
    const event = await requireEventManager(req, req.params.id);
    return prisma.eventGuest.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        host: hostSelect,
        profile: { select: { id: true, name: true, expertise: true, city: true, websiteUrl: true } },
        certificates: { where: { revokedAt: null }, select: { id: true, serial: true, type: true } },
      },
    });
  });

  app.post<{ Params: { id: string } }>("/events/:id/guests", async (req, reply) => {
    const event = await requireEventManager(req, req.params.id);
    const body = guestSchema.parse(req.body);
    await validateHost(event.tenantId, body.hostUserId);
    const { profileId, ...fields } = body;

    let profile: GuestProfile;
    if (profileId) {
      const found = await prisma.guestProfile.findFirst({ where: { id: profileId, tenantId: event.tenantId } });
      if (!found) throw notFound("Guest profile");
      profile = found;
    } else {
      if (!fields.name) throw badRequest("Give the guest's name, or pick someone from the guest library");
      profile = await findOrCreateProfile(event.tenantId, fields);
    }
    if (await prisma.eventGuest.findFirst({ where: { eventId: event.id, profileId: profile.id } })) {
      throw conflict(`${profile.name} is already a guest of this event`);
    }

    // Profile fields first, then anything given explicitly for this event.
    const fromProfile = pickProfileFields(profile as unknown as Record<string, unknown>);
    const guest = await prisma.eventGuest.create({
      data: {
        ...(fromProfile as { name: string }),
        ...(fields as Prisma.EventGuestUncheckedCreateInput),
        name: fields.name ?? profile.name,
        email: lower(fields.email ?? profile.email),
        documents: (fields.documents ?? []) as Prisma.InputJsonValue,
        eventId: event.id,
        profileId: profile.id,
        portalToken: newToken(),
      },
    });
    await logActivity(event.id, req.auth!.user.id, "guest.added", { guestId: guest.id, name: guest.name, role: guest.role });
    return reply.status(201).send(guest);
  });

  app.patch<{ Params: { guestId: string } }>("/guests/:guestId", async (req) => {
    const guest = await loadGuest(req, req.params.guestId);
    const body = guestSchema
      .omit({ profileId: true })
      .extend({ thankYouSent: z.boolean().optional(), syncProfile: z.boolean().optional() })
      .parse(req.body);
    const { thankYouSent, syncProfile, documents, ...fields } = body;
    await validateHost(guest.event.tenantId, fields.hostUserId);
    const updated = await prisma.eventGuest.update({
      where: { id: guest.id },
      data: {
        ...fields,
        ...(fields.email !== undefined && { email: lower(fields.email) }),
        ...(documents && { documents: documents as Prisma.InputJsonValue }),
        ...(thankYouSent !== undefined && { thankYouSentAt: thankYouSent ? new Date() : null }),
        ...(thankYouSent && { status: "THANKED" }),
        ...(fields.status === "INVITED" && !guest.invitedAt && { invitedAt: new Date() }),
      },
    });
    if (syncProfile && updated.profileId) {
      await prisma.guestProfile.update({
        where: { id: updated.profileId },
        data: pickProfileFields(updated as unknown as Record<string, unknown>),
      });
    }
    if (updated.status !== guest.status) {
      await logActivity(guest.eventId, req.auth!.user.id, "guest.status", { guestId: guest.id, name: guest.name, status: updated.status });
    }
    return updated;
  });

  app.delete<{ Params: { guestId: string } }>("/guests/:guestId", async (req) => {
    const guest = await loadGuest(req, req.params.guestId);
    await prisma.eventGuest.delete({ where: { id: guest.id } });
    await logActivity(guest.eventId, req.auth!.user.id, "guest.removed", { name: guest.name });
    return { ok: true };
  });

  /** Everything the host team needs about one guest, on one page. */
  app.get<{ Params: { guestId: string } }>("/guests/:guestId/brief", async (req) => {
    const base = await loadGuest(req, req.params.guestId);
    const guest = await prisma.eventGuest.findUniqueOrThrow({
      where: { id: base.id },
      include: { host: hostSelect, profile: true, certificates: { where: { revokedAt: null } } },
    });
    const e = base.event;
    const [sessions, tasks, campuses, otherAppearances] = await Promise.all([
      prisma.eventSession.findMany({ where: { eventId: e.id }, orderBy: { startsAt: "asc" } }),
      prisma.eventTask.findMany({
        where: {
          eventId: e.id,
          OR: [
            { title: { contains: "guest", mode: "insensitive" } },
            { title: { contains: "speaker", mode: "insensitive" } },
            { title: { contains: guest.name, mode: "insensitive" } },
          ],
        },
        orderBy: [{ phase: "asc" }, { sortOrder: "asc" }],
        include: { assignee: { select: { id: true, name: true } } },
      }),
      prisma.eventCampus.findMany({ where: { eventId: e.id }, include: { campus: true } }),
      guest.profileId
        ? prisma.eventGuest.findMany({
            where: { profileId: guest.profileId, id: { not: guest.id } },
            orderBy: { event: { startsAt: "desc" } },
            take: 10,
            select: { role: true, status: true, talkTitle: true, event: { select: { id: true, slug: true, title: true, startsAt: true } } },
          })
        : Promise.resolve([]),
    ]);
    const baseUrl = await brandBaseUrl(e.tenantId);
    const { certificates, host, profile, portalToken, ...g } = guest;
    return {
      guest: g,
      profile: profile && { ...profile },
      event: {
        id: e.id, slug: e.slug, title: e.title, type: e.type, status: e.status, mode: e.mode, startsAt: e.startsAt, endsAt: e.endsAt,
        venue: e.venue, venueMapUrl: e.venueMapUrl, meetingUrl: e.meetingUrl, livestreamUrl: e.livestreamUrl,
        contactEmail: e.contactEmail, contactPhone: e.contactPhone, campuses: campuses.map((c) => c.campus.name),
        url: `${baseUrl}/events/${e.slug}`,
      },
      sessions: sessions.map((s) => ({
        ...s,
        isGuestSession: !!s.speaker && s.speaker.toLowerCase().includes(guest.name.toLowerCase()),
      })),
      host,
      logistics: {
        arrivalAt: g.arrivalAt, departureAt: g.departureAt, travelNotes: g.travelNotes, stayDetails: g.stayDetails,
        dietary: g.dietary, avRequirements: g.avRequirements, consentRecording: g.consentRecording,
      },
      payment: { honorarium: g.honorarium, paymentStatus: g.paymentStatus, invoiceUrl: g.invoiceUrl, mementoGiven: g.mementoGiven },
      documents: g.documents,
      tasks,
      certificates: certificates.map((c) => ({ id: c.id, serial: c.serial, type: c.type })),
      otherAppearances,
      portalUrl: `${baseUrl}/guest/${portalToken}`,
    };
  });

  app.post<{ Params: { guestId: string } }>("/guests/:guestId/invite", async (req) => {
    const guest = await loadGuest(req, req.params.guestId);
    if (!guest.email) throw badRequest("Add the guest's email before sending an invite");
    const queued = await notifyGuest(guest.id, "guest.invite");
    const updated = await prisma.eventGuest.update({
      where: { id: guest.id },
      data: {
        invitedAt: new Date(),
        ...(["PROPOSED", "DECLINED"].includes(guest.status) && { status: "INVITED" }),
      },
    });
    await logActivity(guest.eventId, req.auth!.user.id, "guest.invited", { guestId: guest.id, name: guest.name, email: guest.email });
    return { guest: updated, notifications: queued.map((n) => ({ id: n.id, status: n.status })) };
  });

  app.post<{ Params: { guestId: string } }>("/guests/:guestId/thank-you", async (req) => {
    const guest = await loadGuest(req, req.params.guestId);
    if (!guest.email) throw badRequest("Add the guest's email before sending a thank-you note");
    const queued = await notifyGuest(guest.id, "guest.thank_you");
    const updated = await prisma.eventGuest.update({ where: { id: guest.id }, data: { status: "THANKED", thankYouSentAt: new Date() } });
    await prisma.eventTask.updateMany({
      where: { eventId: guest.eventId, phase: "POST", title: { contains: "thank-you", mode: "insensitive" }, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() },
    });
    await logActivity(guest.eventId, req.auth!.user.id, "guest.thanked", { guestId: guest.id, name: guest.name });
    return { guest: updated, notifications: queued.map((n) => ({ id: n.id, status: n.status })) };
  });

  // ───────── Guest self-service portal (token in the link, no login) ─────────
  app.get<{ Params: { token: string } }>("/guest-portal/:token", async (req) => {
    const g = await loadPortalGuest(req, req.params.token);
    const e = g.event;
    return {
      guest: portalView(g),
      event: {
        title: e.title, slug: e.slug, type: e.type, mode: e.mode, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt,
        venue: e.venue, venueMapUrl: e.venueMapUrl, meetingUrl: e.meetingUrl, coverImageUrl: e.coverImageUrl,
      },
      host: g.host && { name: g.host.name, email: g.host.email, phone: g.host.phone },
      brand: { name: e.tenant.name, slug: e.tenant.slug, theme: themeOf(e.tenant) },
      editable: !["ARCHIVED", "CANCELLED"].includes(e.status),
    };
  });

  app.put<{ Params: { token: string } }>("/guest-portal/:token", async (req) => {
    const g = await loadPortalGuest(req, req.params.token);
    if (["ARCHIVED", "CANCELLED"].includes(g.event.status)) throw badRequest("This event is closed");
    const body = portalSchema.parse(req.body);
    const firstSubmission = !g.profileSubmittedAt;
    const updated = await prisma.eventGuest.update({
      where: { id: g.id },
      data: {
        ...body,
        profileSubmittedAt: new Date(),
        ...(["PROPOSED", "INVITED"].includes(g.status) && { status: "CONFIRMED" }),
      },
    });
    if (updated.profileId) {
      await prisma.guestProfile.update({
        where: { id: updated.profileId },
        data: pickProfileFields(updated as unknown as Record<string, unknown>),
      });
    }
    await logActivity(g.eventId, null, "guest.profile_submitted", { guestId: g.id, name: updated.name, first: firstSubmission });
    if (g.hostUserId) {
      await enqueue({
        tenantId: g.event.tenantId, eventId: g.eventId, userId: g.hostUserId, channels: ["IN_APP"], template: "guest.profile_submitted",
        subject: `${updated.name} updated their guest details`, body: `${updated.name} filled in their details for ${g.event.title}.`,
      });
    }
    return { guest: portalView(updated) };
  });

  app.post<{ Params: { token: string } }>("/guest-portal/:token/upload", async (req) => {
    const g = await loadPortalGuest(req, req.params.token);
    if (["ARCHIVED", "CANCELLED"].includes(g.event.status)) throw badRequest("This event is closed");
    const { buffer } = await readUpload(req);
    const file = await storeUpload(g.event.tenant.slug, buffer, { imagesOnly: true });
    // Convenience: the uploaded photo becomes the guest's photo right away.
    await prisma.eventGuest.update({ where: { id: g.id }, data: { photoUrl: file.url } });
    await logActivity(g.eventId, null, "guest.photo_uploaded", { guestId: g.id, name: g.name });
    return { url: file.url };
  });

  // ───────── Public speaker page ─────────
  app.get<{ Params: { guestId: string } }>("/speakers/:guestId", async (req) => {
    const tenant = requireTenant(req);
    const PUBLIC_STATUSES = ["CONFIRMED", "ARRIVED", "THANKED"] as const;
    const HIDDEN = ["DRAFT", "PLANNING"] as const;
    const g = await prisma.eventGuest.findUnique({ where: { id: req.params.guestId }, include: { event: true } });
    if (
      !g || g.event.tenantId !== tenant.id || !g.isPublic ||
      !(PUBLIC_STATUSES as readonly string[]).includes(g.status) || (HIDDEN as readonly string[]).includes(g.event.status)
    ) {
      throw notFound("Speaker");
    }
    const appearances = g.profileId
      ? await prisma.eventGuest.findMany({
          where: {
            profileId: g.profileId, isPublic: true, status: { in: [...PUBLIC_STATUSES] },
            event: { tenantId: tenant.id, status: { notIn: [...HIDDEN] } },
          },
          orderBy: { event: { startsAt: "desc" } },
          select: {
            id: true, role: true, talkTitle: true, sessionAt: true,
            event: { select: { id: true, slug: true, title: true, type: true, startsAt: true, coverImageUrl: true } },
          },
        })
      : [];
    const profile = g.profileId ? await prisma.guestProfile.findUnique({ where: { id: g.profileId } }) : null;
    return {
      id: g.id, profileId: g.profileId, name: g.name, designation: g.designation, organization: g.organization, bio: g.bio,
      photoUrl: g.photoUrl, linkedinUrl: g.linkedinUrl, websiteUrl: profile?.websiteUrl ?? null, expertise: profile?.expertise ?? [],
      role: g.role, talkTitle: g.talkTitle, talkAbstract: g.talkAbstract, sessionAt: g.sessionAt,
      event: { id: g.event.id, slug: g.event.slug, title: g.event.title, startsAt: g.event.startsAt },
      events: appearances.map((a) => ({ guestId: a.id, role: a.role, talkTitle: a.talkTitle, sessionAt: a.sessionAt, ...a.event })),
    };
  });
}
