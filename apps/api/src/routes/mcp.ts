import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { Tenant } from "@prisma/client";
import { EVENT_STATUSES, EVENT_TYPES, createEventSchema } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { apiBaseUrl } from "../lib/brand";
import { userForAccessToken } from "./oauth";

/**
 * MCP server for AI assistants (claude.ai custom connector, Claude Desktop, Claude Code):  POST /mcp/<brand>
 *
 * Every tool runs as the connected person, through the same API the website uses (with their role and
 * permissions), so the assistant can never do more than that person could in the admin panel.
 * Ready-made tools cover the common jobs; `call_api` reaches every other endpoint (see `list_api_endpoints`).
 */

/** Every /v1 route, collected at start-up (app.ts adds the onRoute hook). */
export const API_ROUTES: { method: string; url: string }[] = [];
export function collectRoute(r: { method: string | string[]; url: string }) {
  if (!r.url.startsWith("/v1/") || r.url.startsWith("/v1/oauth")) return;
  for (const m of ([] as string[]).concat(r.method)) if (m !== "HEAD" && m !== "OPTIONS") API_ROUTES.push({ method: m, url: r.url.slice(3) });
}

const MAX_TEXT = 60_000;

type Ctx = { app: FastifyInstance; tenant: Tenant; userId: string };

/** Calls the platform API as the connected person. */
async function api(ctx: Ctx, method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    for (const x of ([] as unknown[]).concat(v)) qs.append(k, String(x));
  }
  const url = `/v1${path}${qs.size ? `${path.includes("?") ? "&" : "?"}${qs}` : ""}`;
  const res = await ctx.app.inject({
    method: method as "GET",
    url,
    headers: {
      authorization: `Bearer ${ctx.app.jwt.sign({ sub: ctx.userId }, { expiresIn: "5m" })}`,
      "x-tenant": ctx.tenant.slug,
      ...(opts.body !== undefined && { "content-type": "application/json" }),
    },
    payload: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const type = String(res.headers["content-type"] ?? "");
  let data: unknown;
  if (/json/.test(type)) { try { data = res.json(); } catch { data = res.body; } }
  else if (/^text\//.test(type)) data = res.body;
  else data = { note: `Binary file (${type || "unknown type"}, ${res.rawPayload.length} bytes). Download it from the website instead.` };
  return { status: res.statusCode, ok: res.statusCode < 400, data };
}

function out(r: { status: number; ok: boolean; data: unknown }) {
  let text = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 1);
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n… (cut: ${text.length.toLocaleString()} characters in total; ask for fewer items, e.g. with limit or filters)`;
  return { content: [{ type: "text" as const, text: r.ok ? text : `Error ${r.status}: ${text}` }], isError: !r.ok };
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

function buildServer(ctx: Ctx, who: string) {
  const brand = ctx.tenant.name;
  const server = new McpServer(
    { name: `${brand} Events`, version: "1.0.0" },
    {
      instructions: [
        `You are connected to the ${brand} events platform as ${who}. Every action runs with this person's own role and permissions; if something is refused, say so plainly.`,
        "Times are stored in UTC; show them to people in India time (IST, UTC+5:30). Events can be referred to by id or by slug.",
        "Use the ready-made tools first. For anything else, call list_api_endpoints, then call_api. Read before you write: fetch the record, then change it.",
        "Before anything that emails or notifies students (announcements, reports, reminders), publishes or cancels an event, or deletes data, tell the person exactly what will happen and get a clear yes.",
        "Never invent numbers, names or links; only report what the tools return.",
      ].join("\n"),
    },
  );
  const tool = server.registerTool.bind(server);

  tool("whoami", { title: "Who am I", description: "The connected person, their role in this brand and their campus.", annotations: READ }, async () => out(await api(ctx, "GET", "/me")));

  tool("list_events", {
    title: "List events",
    description: "Events of this brand, newest first by default. Filter by status, time, campus, type or a search word.",
    inputSchema: {
      upcoming: z.boolean().optional().describe("Only events that haven't ended"),
      past: z.boolean().optional().describe("Only events that have ended"),
      status: z.enum(EVENT_STATUSES).optional(),
      type: z.enum(EVENT_TYPES).optional(),
      campusId: z.string().optional(),
      q: z.string().optional().describe("Search in title and tagline"),
      mine: z.boolean().optional().describe("Only events I created or manage"),
      limit: z.number().int().min(1).max(200).default(30),
      offset: z.number().int().min(0).default(0),
    },
    annotations: READ,
  }, async (a) => {
    const r = await api(ctx, "GET", "/events", { query: a });
    if (r.ok && Array.isArray(r.data)) {
      r.data = (r.data as Record<string, unknown>[]).map((e) => ({
        id: e.id, slug: e.slug, title: e.title, type: e.type, status: e.status, approvalStatus: e.approvalStatus, mode: e.mode,
        startsAt: e.startsAt, endsAt: e.endsAt, venue: e.venue, campuses: (e.campuses as { campus: { name: string } }[] | undefined)?.map((c) => c.campus.name),
        registrations: (e._count as Record<string, number> | undefined)?.registrations, checklist: e.checklist,
      }));
    }
    return out(r);
  });

  tool("get_event", {
    title: "Get an event", description: "Full details of one event (by id or slug).",
    inputSchema: { event: z.string().describe("Event id or slug") }, annotations: READ,
  }, async ({ event }) => out(await api(ctx, "GET", `/events/${encodeURIComponent(event)}`)));

  tool("event_dashboard", {
    title: "Event dashboard", description: "Numbers for one event: registrations, check-ins, teams, tasks and more (organisers and staff).",
    inputSchema: { eventId: z.string() }, annotations: READ,
  }, async ({ eventId }) => out(await api(ctx, "GET", `/events/${encodeURIComponent(eventId)}/dashboard`)));

  tool("list_registrations", {
    title: "List registrations", description: "People registered for an event, with status and ticket code (staff of that event only).",
    inputSchema: { eventId: z.string(), status: z.string().optional().describe("e.g. REGISTERED, CHECKED_IN, WAITLISTED"), q: z.string().optional() },
    annotations: READ,
  }, async ({ eventId, ...query }) => out(await api(ctx, "GET", `/events/${encodeURIComponent(eventId)}/registrations`, { query })));

  tool("check_in", {
    title: "Check someone in", description: "Mark a participant as arrived using their ticket code.",
    inputSchema: { ticketCode: z.string().min(4), eventId: z.string().optional() }, annotations: WRITE,
  }, async (a) => out(await api(ctx, "POST", "/checkin", { body: a })));

  tool("create_event", {
    title: "Create an event",
    description: "Create an event page (starts as a draft unless you set a status later). Dates are ISO 8601; include the +05:30 offset for India times. Use list_campuses for campus ids.",
    inputSchema: createEventSchema.shape, annotations: WRITE,
  }, async (a) => out(await api(ctx, "POST", "/events", { body: a })));

  tool("update_event", {
    title: "Update an event", description: "Change fields of an event (same fields as create_event, plus meetingUrl, feeAmount, coverImageUrl, …). Only the fields you pass change.",
    inputSchema: { eventId: z.string(), changes: z.record(z.unknown()).describe("Fields to change, e.g. {\"venue\": \"Main auditorium\"}") }, annotations: WRITE,
  }, async ({ eventId, changes }) => out(await api(ctx, "PATCH", `/events/${encodeURIComponent(eventId)}`, { body: changes })));

  tool("set_event_status", {
    title: "Move an event to a new stage",
    description: `Change the stage: ${EVENT_STATUSES.join(" → ")}. Publishing (ANNOUNCED / REGISTRATION_OPEN) makes it public and can email students; confirm with the person first.`,
    inputSchema: { eventId: z.string(), status: z.enum(EVENT_STATUSES) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ eventId, status }) => out(await api(ctx, "POST", `/events/${encodeURIComponent(eventId)}/status`, { body: { status } })));

  tool("my_tasks", { title: "My tasks", description: "Checklist tasks assigned to me or my teams, across events.", annotations: READ }, async () => out(await api(ctx, "GET", "/me/tasks")));

  tool("event_tasks", {
    title: "Event tasks", description: "The checklist of one event.", inputSchema: { eventId: z.string() }, annotations: READ,
  }, async ({ eventId }) => out(await api(ctx, "GET", `/events/${encodeURIComponent(eventId)}/tasks`)));

  tool("update_task", {
    title: "Update a task", description: "Change a task, e.g. mark done ({\"status\": \"DONE\"}), set a proof link or due date.",
    inputSchema: { taskId: z.string(), changes: z.record(z.unknown()) }, annotations: WRITE,
  }, async ({ taskId, changes }) => out(await api(ctx, "PATCH", `/tasks/${encodeURIComponent(taskId)}`, { body: changes })));

  tool("insights", {
    title: "Insights", description: "Admins: trends, campus comparison, event types, feedback by area and event scorecards.",
    inputSchema: { months: z.number().int().min(1).max(36).default(12), campusId: z.string().optional() }, annotations: READ,
  }, async (a) => out(await api(ctx, "GET", "/insights", { query: a })));

  tool("event_feedback", {
    title: "Event feedback", description: "Feedback participants gave for an event (admins).", inputSchema: { eventId: z.string() }, annotations: READ,
  }, async ({ eventId }) => out(await api(ctx, "GET", `/events/${encodeURIComponent(eventId)}/feedback`)));

  tool("event_outcome", {
    title: "Event outcome", description: "Outcome of an event: turnout, winners, posts, certificates and the leadership summary.", inputSchema: { eventId: z.string() }, annotations: READ,
  }, async ({ eventId }) => out(await api(ctx, "GET", `/events/${encodeURIComponent(eventId)}/outcome`)));

  tool("list_campuses", { title: "List campuses", description: "Campuses of this brand with their ids.", annotations: READ }, async () => out(await api(ctx, "GET", "/campuses")));

  tool("calendar", {
    title: "Calendar", description: "Our events plus approved outside hackathons between two dates (ISO 8601).",
    inputSchema: { from: z.string(), to: z.string() }, annotations: READ,
  }, async (a) => out(await api(ctx, "GET", "/calendar", { query: a })));

  tool("outside_events", {
    title: "Outside hackathons and contests", description: "Hackathons from Unstop, Devfolio, MLH, Devpost, coding contests from LeetCode, Codeforces, CodeChef, and ones the team added (staff).",
    inputSchema: { status: z.enum(["SUGGESTED", "APPROVED", "HIDDEN"]).optional(), addedByTeam: z.boolean().optional() }, annotations: READ,
  }, async ({ status, addedByTeam }) => out(await api(ctx, "GET", "/admin/external-events", { query: { status, source: addedByTeam ? "manual" : undefined } })));

  tool("add_outside_event", {
    title: "Add an outside hackathon",
    description: "Add a hackathon or competition from another site to the public calendar (marked External). Dates as YYYY-MM-DD (India).",
    inputSchema: {
      title: z.string(), url: z.string().url(), organizer: z.string().optional(), summary: z.string().optional(),
      startsAt: z.string(), endsAt: z.string(), registrationEndsAt: z.string().optional(),
      mode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).default("ONLINE"), location: z.string().optional(),
      prize: z.string().optional(), teamSize: z.string().optional(), participants: z.number().int().optional(),
      tags: z.array(z.string()).optional(), imageUrl: z.string().url().optional(), major: z.boolean().optional(),
      kind: z.enum(["HACKATHON", "CONTEST"]).optional().describe("CONTEST for a timed coding contest"),
    },
    annotations: WRITE,
  }, async (a) => out(await api(ctx, "POST", "/admin/external-events", { body: a })));

  tool("set_outside_event_visibility", {
    title: "Show or hide an outside hackathon", inputSchema: { id: z.string(), status: z.enum(["APPROVED", "HIDDEN", "SUGGESTED"]) }, annotations: WRITE,
    description: "APPROVED shows it on the public calendar, HIDDEN removes it.",
  }, async ({ id, status }) => out(await api(ctx, "PATCH", `/admin/external-events/${encodeURIComponent(id)}`, { body: { status } })));

  tool("list_api_endpoints", {
    title: "List all API endpoints",
    description: "Every endpoint of the platform (method and path), optionally filtered by a word. Use with call_api for anything the other tools don't cover: judging, certificates, guests, announcements, reports, teams, members, settings…",
    inputSchema: { filter: z.string().optional().describe("e.g. 'judg', 'certificate', 'guest'") }, annotations: READ,
  }, async ({ filter }) => {
    const list = API_ROUTES.filter((r) => !filter || r.url.toLowerCase().includes(filter.toLowerCase())).map((r) => `${r.method} ${r.url}`);
    return { content: [{ type: "text" as const, text: list.join("\n") || "No endpoints match." }] };
  });

  tool("call_api", {
    title: "Call any platform endpoint",
    description: "Call any endpoint from list_api_endpoints as the connected person (e.g. GET /events/:id/judges, POST /events/:id/certificates/generate). Path without /v1; replace :params. Errors explain what's missing. Confirm with the person before anything that emails people, publishes, or deletes.",
    inputSchema: {
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().regex(/^\/[A-Za-z0-9_\-./:%~]*$/, "A path like /events/abc/judges").refine((p) => !p.includes("..") && !p.startsWith("/oauth"), "Not allowed"),
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.unknown().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ method, path, query, body }) => out(await api(ctx, method, path, { query, body: method === "GET" ? undefined : body ?? {} })));

  return server;
}

function unauthorized(reply: FastifyReply, slug: string) {
  return reply
    .status(401)
    .header("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${apiBaseUrl()}/.well-known/oauth-protected-resource/mcp/${slug}"`)
    .send({ error: "unauthorized", error_description: "Connect with your account first" });
}

export async function mcpRoutes(app: FastifyInstance) {
  const handle = async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const slug = req.params.slug.toLowerCase();
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const who = token ? await userForAccessToken(token, slug) : null;
    if (!who) return unauthorized(reply, slug);
    if (req.method !== "POST") {
      // Stateless server: no standalone event stream or sessions to close.
      return reply.status(405).header("Allow", "POST").send({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    }
    const user = await prisma.user.findUnique({ where: { id: who.userId }, select: { name: true, email: true } });
    const membership = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: who.tenant.id, userId: who.userId } }, select: { role: true } });
    const server = buildServer({ app, tenant: who.tenant, userId: who.userId }, `${user?.name ?? "a user"} (${membership?.role ?? "no role"})`);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  };
  app.post<{ Params: { slug: string } }>("/mcp/:slug", handle);
  app.get<{ Params: { slug: string } }>("/mcp/:slug", handle);
  app.delete<{ Params: { slug: string } }>("/mcp/:slug", handle);
}
