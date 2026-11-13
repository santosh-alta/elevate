import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiGet } from "@/lib/api";
import { getOrigin } from "@/lib/tenant";
import { PROVIDERS, STATE_COOKIE, appChallenge, appReturn, isProvider } from "../providers";

/** Sends the visitor to Google or GitHub to choose their account. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = await getOrigin();
  const q = new URL(req.url).searchParams;
  const next = q.get("next") ?? "/me";
  // Started from the mobile app: remember its challenge and return address (both must be present and valid).
  const challenge = appChallenge(q.get("app"));
  const returnTo = appReturn(q.get("return"));
  const forApp = challenge && returnTo ? { app: challenge, returnTo } : {};
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/me";
  if (!isProvider(provider)) return NextResponse.redirect(`${origin}/login`, 302);
  const config = await apiGet<Record<string, string | null>>("/auth/providers");
  const clientId = config?.[provider];
  if (!clientId) {
    return NextResponse.redirect(forApp.returnTo ? `${forApp.returnTo}?error=${provider}-off` : `${origin}/login?error=${provider}-off&next=${encodeURIComponent(safeNext)}`, 302);
  }

  const state = randomBytes(16).toString("hex");
  const url = new URL(PROVIDERS[provider].authorizeUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/${provider}/callback`,
    state,
    ...PROVIDERS[provider].params,
  }).toString();
  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: safeNext, provider, ...forApp }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return res;
}
