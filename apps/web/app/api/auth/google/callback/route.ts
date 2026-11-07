import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/config";
import { getOrigin } from "@/lib/tenant";

const STATE_COOKIE = "elevate_google_state";

/** Google sends the visitor back here; the API turns the code into an Elevate session. */
export async function GET(req: Request) {
  const origin = await getOrigin();
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  let saved: { state?: string; next?: string } = {};
  try { saved = JSON.parse(jar.get(STATE_COOKIE)?.value ?? "{}"); } catch { /* ignore */ }
  const next = saved.next ?? "/me";
  const go = (url: string) => {
    const res = NextResponse.redirect(url, 302);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  const fail = (reason: string) => go(`${origin}/login?error=${reason}&next=${encodeURIComponent(next)}`);

  const code = params.get("code");
  if (params.get("error") || !code) return fail("google-cancelled");
  if (!saved.state || saved.state !== params.get("state")) return fail("google-expired");

  const r = await apiFetch<{ token: string }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ code, redirectUri: `${origin}/api/auth/google/callback` }),
  });
  if (!r.ok || !r.data?.token) return fail("google-failed");
  const res = go(`${origin}${next}`);
  res.cookies.set(TOKEN_COOKIE, r.data.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
