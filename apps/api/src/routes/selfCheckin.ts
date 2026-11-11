import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Event, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { canCheckIn, findEvent, requireUser } from "../lib/permissions";
import { HttpError, badRequest, forbidden } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { brandBaseUrl } from "../lib/brand";

/**
 * Self check-in: the organiser shows a QR on the projector that changes every 30 seconds; students scan it with
 * their phone camera and are marked attended (no app, no queue). Optionally the phone must be near the screen.
 *
 *  code  → in the QR, valid ~90 seconds (current + 2 previous 30s windows), so a forwarded photo soon stops working
 *  pass  → given when a fresh code is opened, valid 10 minutes, so signing in first doesn't make the code expire
 */
const WINDOW_MS = 30_000;
const PASS_MS = 10 * 60_000;
const OPEN_BEFORE_MS = 3 * 3_600_000;
const OPEN_AFTER_MS = 2 * 3_600_000;

const secret = () => process.env.JWT_SECRET ?? "dev-secret";
const sign = (s: string, n = 12) => createHmac("sha256", secret()).update(s).digest("base64url").slice(0, n);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function codeFor(eventId: string, w = Math.floor(Date.now() / WINDOW_MS)) {
  return `${w.toString(36)}.${sign(`attend:${eventId}:${w}`)}`;
}
function codeValid(eventId: string, code: string): boolean {
  const [ws, sig] = code.split(".");
  const w = parseInt(ws ?? "", 36);
  const now = Math.floor(Date.now() / WINDOW_MS);
  if (!sig || !Number.isFinite(w) || w > now || now - w > 2) return false;
  return same(sig, sign(`attend:${eventId}:${w}`));
}
function passFor(eventId: string) {
  const exp = Date.now() + PASS_MS;
  return `${exp.toString(36)}.${sign(`pass:${eventId}:${exp}`, 16)}`;
}
function passValid(eventId: string, pass: string): boolean {
  const [es, sig] = pass.split(".");
  const exp = parseInt(es ?? "", 36);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  return same(sig, sign(`pass:${eventId}:${exp}`, 16));
}

type Geo = { lat: number; lng: number; radius: number };
const geoOf = (e: Event) => ((e.config ?? {}) as { selfCheckin?: { geo?: Geo } }).selfCheckin?.geo ?? null;

/** Metres between two points (haversine). */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function windowError(e: Event): string | null {
  const now = Date.now();
  const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: process.env.DISPLAY_TZ || "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  if (now < e.startsAt.getTime() - OPEN_BEFORE_MS) return `Check-in opens 3 hours before the event (${fmt(new Date(e.startsAt.getTime() - OPEN_BEFORE_MS))}).`;
  if (now > e.endsAt.getTime() + OPEN_AFTER_MS) return "Check-in for this event has closed.";
  return null;
}

async function requireScreen(req: FastifyRequest, idOrSlug: string): Promise<Event> {
  requireUser(req);
  const event = await findEvent(req, idOrSlug);
  if (!(await canCheckIn(req, event))) throw forbidden("Only the event's team can show the check-in screen");
  return event;
}

const publicEvent = (e: Event) => ({ id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, venue: e.venue });

export function selfCheckinRoutes(app: FastifyInstance) {
  /** For the projector screen: the current QR (as an image), seconds until it changes, and the live count. */
  app.get<{ Params: { id: string } }>("/events/:id/attend/code", async (req) => {
    const event = await requireScreen(req, req.params.id);
    const now = Date.now();
    const code = codeFor(event.id);
    const url = `${(await brandBaseUrl(event.tenantId)).replace(/\/$/, "")}/attend/${event.slug}?t=${code}`;
    const [qr, checkedIn, expected] = await Promise.all([
      QRCode.toDataURL(url, { width: 720, margin: 1, errorCorrectionLevel: "M" }),
      prisma.registration.count({ where: { eventId: event.id, status: "CHECKED_IN" } }),
      prisma.registration.count({ where: { eventId: event.id, status: { in: ["REGISTERED", "APPROVED", "CHECKED_IN", "NO_SHOW"] } } }),
    ]);
    return {
      event: publicEvent(event), qr, url, checkedIn, expected,
      expiresIn: Math.ceil((WINDOW_MS - (now % WINDOW_MS)) / 1000),
      geo: geoOf(event), notice: windowError(event),
    };
  });

  /** Turn the "must be near this screen" check on (with the screen's location) or off. */
  app.put<{ Params: { id: string } }>("/events/:id/attend/location", async (req) => {
    const event = await requireScreen(req, req.params.id);
    const { geo } = z.object({ geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), radius: z.number().min(50).max(2000).default(200) }).nullable() }).parse(req.body);
    const config = { ...((event.config ?? {}) as Record<string, unknown>) };
    const sc = { ...((config.selfCheckin ?? {}) as Record<string, unknown>) };
    if (geo) sc.geo = geo; else delete sc.geo;
    config.selfCheckin = sc;
    await prisma.event.update({ where: { id: event.id }, data: { config: config as Prisma.InputJsonValue } });
    return { geo };
  });

  /** Opened from the QR (before signing in): swaps the short-lived code for a 10-minute pass. */
  app.get<{ Params: { id: string } }>("/events/:id/attend/start", async (req) => {
    const event = await findEvent(req, req.params.id);
    const { t } = z.object({ t: z.string().max(60) }).parse(req.query);
    if (!codeValid(event.id, t)) throw new HttpError(410, "expired", "This QR code has changed. Scan the QR on the screen again.");
    return { event: publicEvent(event), pass: passFor(event.id), needsLocation: !!geoOf(event) };
  });

  /** The student checks themselves in. */
  app.post<{ Params: { id: string } }>("/events/:id/attend", async (req) => {
    const auth = requireUser(req);
    const event = await findEvent(req, req.params.id);
    const body = z.object({
      pass: z.string().max(80),
      lat: z.number().optional(), lng: z.number().optional(), accuracy: z.number().optional(),
    }).parse(req.body);
    if (!passValid(event.id, body.pass)) throw new HttpError(410, "expired", "This check-in link has expired. Scan the QR on the screen again.");
    const closed = windowError(event);
    if (closed) throw badRequest(closed);

    const geo = geoOf(event);
    if (geo) {
      if (body.lat == null || body.lng == null) throw badRequest("Please allow location so we can confirm you're at the venue.");
      const d = metres(geo, { lat: body.lat, lng: body.lng });
      const slack = Math.min(body.accuracy ?? 0, 300);
      if (d > geo.radius + slack) throw badRequest(`You seem to be about ${Math.round(d)} m away from the venue. Check in when you're there, or go to the help desk.`);
    }

    const reg = await prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: auth.user.id } } });
    if (!reg || ["CANCELLED", "REJECTED"].includes(reg.status)) {
      throw new HttpError(404, "not_registered", "You're not registered for this event. Please go to the help desk.");
    }
    if (reg.status === "PENDING_PAYMENT") throw badRequest("Your payment isn't complete yet. Please go to the help desk.");
    if (reg.status === "WAITLISTED") throw badRequest("You're on the waitlist. Please go to the help desk.");
    if (reg.status === "CHECKED_IN") return { status: "already", name: auth.user.name, checkedInAt: reg.checkedInAt, event: publicEvent(event) };

    const updated = await prisma.registration.update({
      where: { id: reg.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: auth.user.id },
    });
    await logActivity(event.id, auth.user.id, "checkin.self", { name: auth.user.name });
    return { status: "checked_in", name: auth.user.name, checkedInAt: updated.checkedInAt, event: publicEvent(event) };
  });
}
