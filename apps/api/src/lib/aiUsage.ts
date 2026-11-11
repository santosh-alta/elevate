import { prisma } from "../plugins/prisma";
import { HttpError } from "./errors";
import type { FastifyRequest } from "fastify";
import { aiEnabled } from "./ai";
import { hasRole } from "./permissions";

/** AI writing uses per day: brand admins get more because they edit many events. */
export function writeLimitFor(req: FastifyRequest): number {
  return hasRole(req, ["BRAND_ADMIN"]) ? Number(process.env.AI_ADMIN_DAILY_LIMIT) || 30 : Number(process.env.AI_DAILY_LIMIT) || 5;
}

/** Daily AI allowance per person (India date). "write" = editor help, "chat" = the assistant. */
export type AiKind = "write" | "chat";
export type AiUsageInfo = { enabled: boolean; used: number; limit: number; remaining: number };

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TZ || "Asia/Kolkata" }).format(new Date());
}

export async function usageOf(userId: string, kind: AiKind, limit: number): Promise<AiUsageInfo> {
  const row = await prisma.aiUsage.findUnique({ where: { userId_day_kind: { userId, day: today(), kind } } });
  const used = row?.count ?? 0;
  return { enabled: aiEnabled(), used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Takes one use atomically (two tabs can't both get the last one), runs `fn`, and gives the use back if `fn` fails.
 */
export async function withAllowance<T extends { tokens: number }>(
  user: { id: string; tenantId: string }, kind: AiKind, limit: number, fn: () => Promise<T>, limitMessage: string,
): Promise<T> {
  const day = today();
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AiUsage" ("userId", "day", "kind", "tenantId", "count", "updatedAt")
    VALUES (${user.id}, ${day}, ${kind}, ${user.tenantId}, 1, now())
    ON CONFLICT ("userId", "day", "kind") DO UPDATE SET "count" = "AiUsage"."count" + 1, "updatedAt" = now()
    WHERE "AiUsage"."count" < ${limit}
    RETURNING "count"`;
  if (!rows.length) throw new HttpError(429, "ai_limit", limitMessage);
  const key = { userId_day_kind: { userId: user.id, day, kind } };
  try {
    const out = await fn();
    await prisma.aiUsage.update({ where: key, data: { tokens: { increment: out.tokens } } }).catch(() => {});
    return out;
  } catch (e) {
    await prisma.aiUsage.update({ where: key, data: { count: { decrement: 1 } } }).catch(() => {});
    throw e;
  }
}
