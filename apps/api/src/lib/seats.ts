import type { Event, Prisma, PrismaClient, RegistrationStatus } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { notifyRegistration, safely } from "./notify";

type Db = PrismaClient | Prisma.TransactionClient;

/** Statuses that hold a seat. PENDING_PAYMENT holds one until the payment expires. */
export const SEAT_STATUSES: RegistrationStatus[] = ["REGISTERED", "APPROVED", "CHECKED_IN", "PENDING_PAYMENT"];
/** Registrations that count as "in" the event (not cancelled, rejected or waiting). */
export const ACTIVE_STATUSES: RegistrationStatus[] = ["REGISTERED", "APPROVED", "CHECKED_IN", "PENDING_PAYMENT", "WAITLISTED"];

export async function seatsTaken(eventId: string, db: Db = prisma): Promise<number> {
  return db.registration.count({ where: { eventId, status: { in: SEAT_STATUSES } } });
}

/** Seats left (Infinity when the event has no capacity). */
export async function seatsLeft(event: Pick<Event, "id" | "capacity">, db: Db = prisma): Promise<number> {
  if (!event.capacity) return Number.POSITIVE_INFINITY;
  return event.capacity - (await seatsTaken(event.id, db));
}

/** Promotes the oldest waitlisted people while seats are free. Returns how many were promoted. */
export async function promoteWaitlist(eventId: string): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event?.capacity) return 0;
  let free = await seatsLeft(event);
  let promoted = 0;
  while (free > 0) {
    const next = await prisma.registration.findFirst({ where: { eventId, status: "WAITLISTED" }, orderBy: { createdAt: "asc" } });
    if (!next) break;
    await prisma.registration.update({ where: { id: next.id }, data: { status: event.requiresApproval ? "REGISTERED" : "APPROVED" } });
    safely("registration.promoted", () => notifyRegistration(next.id, event.requiresApproval ? "confirmed" : "approved"));
    free--;
    promoted++;
  }
  return promoted;
}

/** Finds a user by email or creates one, and makes sure they are a member of the brand. */
export async function findOrCreateMember(
  db: Db,
  tenantId: string,
  input: { email: string; name: string; phone?: string | null },
) {
  const email = input.email.trim().toLowerCase();
  let user = await db.user.findUnique({ where: { email } });
  if (!user) user = await db.user.create({ data: { email, name: input.name.trim(), phone: input.phone || null } });
  else if (!user.phone && input.phone) user = await db.user.update({ where: { id: user.id }, data: { phone: input.phone } });
  await db.membership.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: { tenantId, userId: user.id, role: "STUDENT" },
    update: {},
  });
  return user;
}
