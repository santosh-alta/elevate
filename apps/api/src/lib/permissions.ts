import type { FastifyRequest } from "fastify";
import type { Event, Role } from "@prisma/client";
import { REVIEWER_ROLES, STAFF_ROLES } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import type { AuthContext } from "../plugins/auth";
import { forbidden, notFound, unauthorized } from "./errors";

export function requireUser(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function isPlatformAdmin(req: FastifyRequest): boolean {
  return !!req.auth?.user.isPlatformAdmin;
}

export function roleOf(req: FastifyRequest): Role | null {
  return req.auth?.membership?.role ?? null;
}

export function hasRole(req: FastifyRequest, roles: readonly Role[]): boolean {
  if (isPlatformAdmin(req)) return true;
  const role = roleOf(req);
  return !!role && roles.includes(role);
}

/** Brand staff: brand admins, campus admins and event managers. */
export function isStaff(req: FastifyRequest): boolean {
  return hasRole(req, STAFF_ROLES as Role[]);
}

export function requireStaff(req: FastifyRequest): AuthContext {
  const auth = requireUser(req);
  requireTenant(req);
  if (!isStaff(req)) throw forbidden();
  return auth;
}

/** Admins and moderators: approve or reject submitted event pages. */
export function isReviewer(req: FastifyRequest): boolean {
  return hasRole(req, REVIEWER_ROLES as Role[]);
}

export function requireReviewer(req: FastifyRequest): AuthContext {
  const auth = requireUser(req);
  requireTenant(req);
  if (!isReviewer(req)) throw forbidden("Only admins and moderators can review events");
  return auth;
}

/** Organizers: create events that need approval, and manage only their own events. */
export function isOrganizer(req: FastifyRequest): boolean {
  return !isPlatformAdmin(req) && roleOf(req) === "ORGANIZER";
}

/** Staff create events directly; organizers create events that wait for approval. */
export function requireEventCreator(req: FastifyRequest): AuthContext {
  const auth = requireUser(req);
  requireTenant(req);
  if (!isStaff(req) && !isOrganizer(req)) throw forbidden("Ask an admin to make you an organizer to create events");
  return auth;
}

export function requireBrandAdmin(req: FastifyRequest): AuthContext {
  const auth = requireUser(req);
  requireTenant(req);
  if (!hasRole(req, ["BRAND_ADMIN"])) throw forbidden("Brand admin access required");
  return auth;
}

export function requirePlatformAdmin(req: FastifyRequest): AuthContext {
  const auth = requireUser(req);
  if (!auth.user.isPlatformAdmin) throw forbidden("Platform admin access required");
  return auth;
}

/** Finds an event by id or slug inside the current tenant. */
export async function findEvent(req: FastifyRequest, idOrSlug: string): Promise<Event> {
  const tenant = requireTenant(req);
  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  if (!event) throw notFound("Event");
  return event;
}

/**
 * Can the current user manage this event?
 * - platform / brand admins and moderators: every event of the brand
 * - campus admins: events at their campus, or that they created
 * - event managers and organizers: events they created or are assigned to as MANAGER
 */
export async function canManageEvent(req: FastifyRequest, event: Event): Promise<boolean> {
  if (!req.auth) return false;
  if (req.tenant && event.tenantId !== req.tenant.id) return false;
  if (hasRole(req, ["BRAND_ADMIN", "MODERATOR"])) return true;
  const userId = req.auth.user.id;
  const role = roleOf(req);
  if (event.createdById === userId && (role === "CAMPUS_ADMIN" || role === "EVENT_MANAGER" || role === "ORGANIZER")) return true;
  if (role === "CAMPUS_ADMIN" && req.auth.membership?.campusId) {
    const link = await prisma.eventCampus.findUnique({
      where: { eventId_campusId: { eventId: event.id, campusId: req.auth.membership.campusId } },
    });
    if (link) return true;
  }
  if (role === "EVENT_MANAGER" || role === "CAMPUS_ADMIN" || role === "ORGANIZER") {
    const staff = await prisma.eventStaff.findFirst({ where: { eventId: event.id, userId, role: "MANAGER" } });
    if (staff) return true;
  }
  return false;
}

/** Loads an event in the tenant and asserts the caller can manage it. */
export async function requireEventManager(req: FastifyRequest, idOrSlug: string): Promise<Event> {
  requireUser(req);
  const event = await findEvent(req, idOrSlug);
  if (!(await canManageEvent(req, event))) throw forbidden();
  return event;
}

/** Asserts that an event loaded through a child resource belongs to this tenant and can be managed. */
export async function assertManageable(req: FastifyRequest, event: Event): Promise<void> {
  requireUser(req);
  const tenant = requireTenant(req);
  if (event.tenantId !== tenant.id) throw notFound();
  if (!(await canManageEvent(req, event))) throw forbidden();
}

/** Managers plus volunteers (brand-level role or event-level VOLUNTEER assignment). */
export async function canCheckIn(req: FastifyRequest, event: Event): Promise<boolean> {
  if (await canManageEvent(req, event)) return true;
  if (!req.auth) return false;
  if (roleOf(req) === "VOLUNTEER") return true;
  const staff = await prisma.eventStaff.findFirst({
    where: { eventId: event.id, userId: req.auth.user.id, role: "VOLUNTEER" },
  });
  return !!staff;
}
