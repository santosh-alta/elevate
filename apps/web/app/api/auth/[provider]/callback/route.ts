import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/config";
import { getOrigin } from "@/lib/tenant";
import { STATE_COOKIE, appChallenge, appReturn, isProvider } from "../providers";

/** Google/GitHub send the visitor back here; the API turns the code into an Elevate session. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = await getOrigin();
  const params = new URL(req.url).searchParams;
  let saved: { state?: string; next?: string; provider?: string; app?: string; returnTo?: string } = {};
  try { saved = JSON.parse((await cookies()).get(STATE_COOKIE)?.value ?? "{}"); } catch { /* ignore */ }
  const next = saved.next ?? "/me";
  const go = (url: string) => {
    const res = NextResponse.redirect(url, 302);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  // Started from the mobile app: results go back to the app instead of the website.
  const appCh = appChallenge(saved.app ?? null);
  const appTo = appCh ? appReturn(saved.returnTo ?? null) : null;
  const fail = (reason: string, message?: string) =>
    go(appTo
      ? `${appTo}?error=${reason}${message ? `&message=${encodeURIComponent(message)}` : ""}`
      : `${origin}/login?error=${reason}${message ? `&message=${encodeURIComponent(message)}` : ""}&next=${encodeURIComponent(next)}`);

  if (!isProvider(provider)) return fail("login-failed");
  const code = params.get("code");
  if (params.get("error") || !code) return fail("login-cancelled");
  if (!saved.state || saved.state !== params.get("state") || saved.provider !== provider) return fail("login-expired");

  const r = await apiFetch<{ token: string; user?: { profileCompletedAt?: string | null } }>(`/auth/${provider}`, {
    method: "POST",
    body: JSON.stringify({ code, redirectUri: `${origin}/api/auth/${provider}/callback` }),
  });
  if (!r.ok || !r.data?.token) return fail("login-failed", r.error ?? "");
  if (appTo) {
    // Hand the sign-in to the app: a short-lived code that only the app (holding the secret behind the challenge) can redeem.
    const h = await apiFetch<{ code: string }>("/auth/app-handoff", {
      method: "POST",
      body: JSON.stringify({ challenge: appCh }),
      headers: { Authorization: `Bearer ${r.data.token}` },
    });
    if (!h.ok || !h.data?.code) return fail("login-failed");
    return go(`${appTo}?code=${encodeURIComponent(h.data.code)}`);
  }
  const res = go(r.data.user?.profileCompletedAt ? `${origin}${next}` : `${origin}/profile?next=${encodeURIComponent(next)}`);
  res.cookies.set(TOKEN_COOKIE, r.data.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
