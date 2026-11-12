import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { requireUser } from "../lib/permissions";
import { apiBaseUrl, brandBaseUrl } from "../lib/brand";
import { badRequest, notFound } from "../lib/errors";

/**
 * "Connect Claude": OAuth 2.1 for the MCP server (see routes/mcp.ts), as claude.ai custom connectors expect it.
 *   discovery   GET  /.well-known/oauth-protected-resource[/mcp/<brand>]  and  /.well-known/oauth-authorization-server
 *   register    POST /oauth/register      (dynamic client registration; public clients, PKCE S256 required)
 *   authorize   GET  /oauth/authorize     → the brand's site /connect/claude?req=…, where the signed-in person approves
 *   token       POST /oauth/token         (authorization_code + PKCE, refresh_token with rotation)
 * The person's own role decides what the app can do. Connections are listed and revoked on /connect/claude.
 */

const ACCESS_TTL = 24 * 3600_000;
const REFRESH_TTL = 90 * 86_400_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const b64url = (buf: Buffer) => buf.toString("base64url");

export const mcpResourceUrl = (slug: string) => `${apiBaseUrl()}/mcp/${slug}`;

function oauthError(reply: FastifyReply, status: number, error: string, description: string) {
  return reply.status(status).header("Cache-Control", "no-store").send({ error, error_description: description });
}

/** Brand from an MCP resource URL (…/mcp/<slug>), else the only brand with a verified domain. */
async function tenantForResource(resource?: string) {
  const slug = resource?.match(/\/mcp\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase();
  if (slug) return prisma.tenant.findUnique({ where: { slug } });
  const withDomain = await prisma.tenant.findMany({ where: { domains: { some: { verifiedAt: { not: null } } } }, take: 2 });
  return withDomain.length === 1 ? withDomain[0] : null;
}

async function issueTokens(base: { clientId: string; tenantId: string; userId: string; connectionId: string; scope?: string | null }) {
  const access = secret();
  const refresh = secret();
  const now = Date.now();
  await prisma.oAuthGrant.createMany({
    data: [
      { ...base, kind: "access", tokenHash: sha(access), expiresAt: new Date(now + ACCESS_TTL) },
      { ...base, kind: "refresh", tokenHash: sha(refresh), expiresAt: new Date(now + REFRESH_TTL) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: base.scope ?? "platform" };
}

/** The person behind an MCP access token, or null. */
export async function userForAccessToken(token: string, tenantSlug: string) {
  const g = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha(token) } });
  if (!g || g.kind !== "access" || g.revokedAt || g.expiresAt < new Date() || !g.userId) return null;
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.id !== g.tenantId) return null;
  if (!g.lastUsedAt || Date.now() - g.lastUsedAt.getTime() > 60_000) {
    await prisma.oAuthGrant.update({ where: { id: g.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { userId: g.userId, tenant };
}

export async function oauthRoutes(app: FastifyInstance) {
  // OAuth clients post forms.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  const resourceMeta = (slug?: string) => ({
    resource: slug ? mcpResourceUrl(slug) : `${apiBaseUrl()}/mcp`,
    authorization_servers: [apiBaseUrl()],
    scopes_supported: ["platform"],
    bearer_methods_supported: ["header"],
  });
  app.get("/.well-known/oauth-protected-resource", async () => resourceMeta());
  app.get<{ Params: { slug: string } }>("/.well-known/oauth-protected-resource/mcp/:slug", async (req) => resourceMeta(req.params.slug));

  const asMeta = () => ({
    issuer: apiBaseUrl(),
    authorization_endpoint: `${apiBaseUrl()}/oauth/authorize`,
    token_endpoint: `${apiBaseUrl()}/oauth/token`,
    registration_endpoint: `${apiBaseUrl()}/oauth/register`,
    revocation_endpoint: `${apiBaseUrl()}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["platform"],
  });
  app.get("/.well-known/oauth-authorization-server", async () => asMeta());
  app.get("/.well-known/openid-configuration", async () => asMeta());

  app.post("/oauth/register", async (req, reply) => {
    const b = z.object({
      client_name: z.string().trim().max(100).optional(),
      redirect_uris: z.array(z.string().url()).min(1).max(10),
    }).safeParse(req.body);
    if (!b.success) return oauthError(reply, 400, "invalid_client_metadata", "redirect_uris is required");
    for (const u of b.data.redirect_uris) {
      const url = new URL(u);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return oauthError(reply, 400, "invalid_redirect_uri", "Redirect URIs must use https");
    }
    const client = await prisma.oAuthClient.create({
      data: { id: `c_${randomBytes(16).toString("hex")}`, name: b.data.client_name || "AI assistant", redirectUris: b.data.redirect_uris },
    });
    return reply.status(201).send({
      client_id: client.id, client_name: client.name, redirect_uris: client.redirectUris, client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    });
  });

  app.get("/oauth/authorize", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const client = q.client_id ? await prisma.oAuthClient.findUnique({ where: { id: q.client_id } }) : null;
    if (!client) return reply.status(400).type("text/plain").send("Unknown app. Remove the connector and add it again.");
    if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) return reply.status(400).type("text/plain").send("This return address isn't registered for the app.");
    const back = new URL(q.redirect_uri);
    const fail = (error: string, description: string) => {
      back.searchParams.set("error", error); back.searchParams.set("error_description", description);
      if (q.state) back.searchParams.set("state", q.state);
      return reply.redirect(back.toString());
    };
    if (q.response_type !== "code") return fail("unsupported_response_type", "Only code is supported");
    if (!q.code_challenge || (q.code_challenge_method ?? "plain") !== "S256") return fail("invalid_request", "PKCE with S256 is required");
    const tenant = await tenantForResource(q.resource);
    if (!tenant) return fail("invalid_target", "Unknown brand; use the connector URL that ends in /mcp/<brand>");
    const raw = secret();
    await prisma.oAuthGrant.create({
      data: {
        kind: "request", tokenHash: sha(raw), clientId: client.id, tenantId: tenant.id, redirectUri: q.redirect_uri,
        codeChallenge: q.code_challenge, state: q.state ?? null, scope: q.scope ?? "platform", expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return reply.redirect(`${await brandBaseUrl(tenant.id)}/connect/claude?req=${raw}`);
  });

  /** Approval page data (signed-in person on the brand's site). */
  app.get<{ Params: { req: string } }>("/v1/oauth/requests/:req", async (req) => {
    const auth = requireUser(req);
    const tenant = requireTenant(req);
    const g = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha(req.params.req) }, include: { client: true } });
    if (!g || g.kind !== "request" || g.tenantId !== tenant.id || g.expiresAt < new Date()) throw notFound("Sign-in request (it may have expired; start connecting again)");
    return { appName: g.client.name, returnHost: new URL(g.redirectUri!).host, user: { name: auth.user.name, email: auth.user.email }, role: auth.membership?.role ?? null };
  });

  app.post<{ Params: { req: string } }>("/v1/oauth/requests/:req/decision", async (req) => {
    const auth = requireUser(req);
    const tenant = requireTenant(req);
    const { allow } = z.object({ allow: z.boolean() }).parse(req.body);
    const g = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha(req.params.req) } });
    if (!g || g.kind !== "request" || g.tenantId !== tenant.id || g.expiresAt < new Date()) throw notFound("Sign-in request");
    await prisma.oAuthGrant.delete({ where: { id: g.id } });
    const back = new URL(g.redirectUri!);
    if (g.state) back.searchParams.set("state", g.state);
    if (!allow) {
      back.searchParams.set("error", "access_denied");
      return { redirect: back.toString() };
    }
    const code = secret();
    await prisma.oAuthGrant.create({
      data: {
        kind: "code", tokenHash: sha(code), clientId: g.clientId, tenantId: g.tenantId, userId: auth.user.id, connectionId: `conn_${randomBytes(12).toString("hex")}`,
        redirectUri: g.redirectUri, codeChallenge: g.codeChallenge, scope: g.scope, expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    back.searchParams.set("code", code);
    return { redirect: back.toString() };
  });

  app.post("/oauth/token", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    if (b.grant_type === "authorization_code") {
      if (!b.code || !b.code_verifier) return oauthError(reply, 400, "invalid_request", "code and code_verifier are required");
      const g = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha(b.code) } });
      if (!g || g.kind !== "code") return oauthError(reply, 400, "invalid_grant", "Unknown or used code");
      await prisma.oAuthGrant.delete({ where: { id: g.id } }); // one use only
      if (g.expiresAt < new Date()) return oauthError(reply, 400, "invalid_grant", "Code expired");
      if (b.client_id && b.client_id !== g.clientId) return oauthError(reply, 400, "invalid_grant", "Code was issued to another app");
      if (b.redirect_uri && b.redirect_uri !== g.redirectUri) return oauthError(reply, 400, "invalid_grant", "redirect_uri mismatch");
      if (b64url(createHash("sha256").update(b.code_verifier).digest()) !== g.codeChallenge) return oauthError(reply, 400, "invalid_grant", "PKCE check failed");
      const tokens = await issueTokens({ clientId: g.clientId, tenantId: g.tenantId, userId: g.userId!, connectionId: g.connectionId!, scope: g.scope });
      return reply.header("Cache-Control", "no-store").send(tokens);
    }
    if (b.grant_type === "refresh_token") {
      if (!b.refresh_token) return oauthError(reply, 400, "invalid_request", "refresh_token is required");
      const g = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha(b.refresh_token) } });
      if (!g || g.kind !== "refresh" || g.revokedAt || g.expiresAt < new Date()) return oauthError(reply, 400, "invalid_grant", "Refresh token is invalid or revoked");
      if (b.client_id && b.client_id !== g.clientId) return oauthError(reply, 400, "invalid_grant", "Token was issued to another app");
      // Rotate: the old refresh token stops working; old access tokens of this connection expire naturally.
      await prisma.oAuthGrant.update({ where: { id: g.id }, data: { revokedAt: new Date() } });
      const tokens = await issueTokens({ clientId: g.clientId, tenantId: g.tenantId, userId: g.userId!, connectionId: g.connectionId!, scope: g.scope });
      return reply.header("Cache-Control", "no-store").send(tokens);
    }
    return oauthError(reply, 400, "unsupported_grant_type", "Use authorization_code or refresh_token");
  });

  app.post("/oauth/revoke", async (req, reply) => {
    const token = ((req.body ?? {}) as Record<string, string | undefined>).token;
    if (token) {
      const g = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha(token) } });
      if (g?.connectionId) await prisma.oAuthGrant.updateMany({ where: { connectionId: g.connectionId }, data: { revokedAt: new Date() } });
    }
    return reply.status(200).send({});
  });

  /** The signed-in person's connected apps (on /connect/claude). */
  app.get("/v1/me/connections", async (req: FastifyRequest) => {
    const auth = requireUser(req);
    const tenant = requireTenant(req);
    const grants = await prisma.oAuthGrant.findMany({
      where: { userId: auth.user.id, tenantId: tenant.id, kind: { in: ["access", "refresh"] }, revokedAt: null, connectionId: { not: null } },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const byConn = new Map<string, { id: string; appName: string; connectedAt: Date; lastUsedAt: Date | null; active: boolean }>();
    for (const g of grants) {
      const c = byConn.get(g.connectionId!) ?? { id: g.connectionId!, appName: g.client.name, connectedAt: g.createdAt, lastUsedAt: null, active: false };
      if (g.createdAt < c.connectedAt) c.connectedAt = g.createdAt;
      if (g.lastUsedAt && (!c.lastUsedAt || g.lastUsedAt > c.lastUsedAt)) c.lastUsedAt = g.lastUsedAt;
      if (g.expiresAt > new Date()) c.active = true;
      byConn.set(g.connectionId!, c);
    }
    return { mcpUrl: mcpResourceUrl(tenant.slug), connections: [...byConn.values()].filter((c) => c.active) };
  });

  app.delete<{ Params: { id: string } }>("/v1/me/connections/:id", async (req) => {
    const auth = requireUser(req);
    const n = await prisma.oAuthGrant.updateMany({ where: { connectionId: req.params.id, userId: auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!n.count) throw badRequest("Connection not found");
    return { ok: true };
  });
}
