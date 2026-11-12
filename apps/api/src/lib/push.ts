import { prisma } from "../plugins/prisma";

/**
 * Phone push notifications through Expo's push service (the mobile app registers an Expo push token).
 * Sent alongside every in-app notification; tokens that Expo reports as gone are removed.
 */
type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

export async function sendPush(userId: string, tenantId: string, msg: PushMessage): Promise<void> {
  const tokens = await prisma.pushToken.findMany({ where: { userId, tenantId }, select: { token: true } });
  if (!tokens.length) return;
  const body = msg.body.replace(/\s+/g, " ").trim();
  const messages = tokens.map((t) => ({
    to: t.token, title: msg.title.slice(0, 120), body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
    data: msg.data ?? {}, sound: "default", channelId: "default", priority: "high",
  }));
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN && { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }) },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push ${res.status}`);
  const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  const gone = (out.data ?? []).map((r, i) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? messages[i].to : null)).filter((t): t is string => !!t);
  if (gone.length) await prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
}
