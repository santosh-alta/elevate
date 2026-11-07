import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiGet } from "@/lib/api";
import { getOrigin } from "@/lib/tenant";

const STATE_COOKIE = "elevate_google_state";

/** Sends the visitor to Google's account chooser. The API owns the client id; the secret never leaves the API. */
export async function GET(req: Request) {
  const origin = await getOrigin();
  const next = new URL(req.url).searchParams.get("next") ?? "/me";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/me";
  const config = await apiGet<{ clientId: string | null }>("/auth/google/config");
  if (!config?.clientId) return NextResponse.redirect(`${origin}/login?error=google-off&next=${encodeURIComponent(safeNext)}`, 302);

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: safeNext }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return res;
}
