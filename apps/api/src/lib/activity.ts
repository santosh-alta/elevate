import type { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";

/** Appends an entry to the event's activity timeline. Never throws. */
export async function logActivity(
  eventId: string,
  actorId: string | null | undefined,
  action: string,
  data: Prisma.InputJsonValue = {},
): Promise<void> {
  try {
    await prisma.eventActivity.create({ data: { eventId, actorId: actorId ?? null, action, data } });
  } catch {
    // Activity logging must never break the main action.
  }
}
