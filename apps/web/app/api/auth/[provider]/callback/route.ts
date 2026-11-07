import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/config";
import { getOrigin } from "@/lib/tenant";
import { STATE_COOKIE, isProvider } from "../providers";

/** Google/GitHub send the visitor back here; the API turns the code into an Elevate session. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = await getOrigin();
  const params = new URL(req.url).searchParams;
  let saved: { state?: string; next?: string; provider?: string } = {};
  try { saved = JSON.parse((await cookies()).get(STATE_COOKIE)?.value ?? "{}"); } catch { /* ignore */ }
  const next = saved.next ?? "/me";
  const go = (url: string) => {
    const res = NextResponse.redirect(url, 302);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  const fail = (reason: string) => go(`${origin}/login?error=${reason}&next=${encodeURIComponent(next)}`);

  if (!isProvider(provider)) return fail("login-failed");
  const code = params.get("code");
  if (params.get("error") || !code) return fail("login-cancelled");
  if (!saved.state || saved.state !== params.get("state") || saved.provider !== provider) return fail("login-expired");

  const r = await apiFetch<{ token: string }>(`/auth/${provider}`, {
    method: "POST",
    body: JSON.stringify({ code, redirectUri: `${origin}/api/auth/${provider}/callback` }),
  });
  if (!r.ok || !r.data?.token) return go(`${origin}/login?error=login-failed&message=${encodeURIComponent(r.error ?? "")}&next=${encodeURIComponent(next)}`);
  const res = go(`${origin}${next}`);
  res.cookies.set(TOKEN_COOKIE, r.data.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
