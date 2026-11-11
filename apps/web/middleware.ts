import { NextResponse, type NextRequest } from "next/server";

/** Public pages that are pre-built per brand (see app/s/[host]). */
const PREBUILT = /^\/(campuses(\/[a-z0-9-]+)?)?$/i;

/**
 * Forwards the requested host so server components can resolve the brand (white-label), and serves the
 * pre-built public pages: event.altaschool.tech/campuses → /s/event.altaschool.tech/campuses (address unchanged).
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const { pathname } = req.nextUrl;

  if ((req.method === "GET" || req.method === "HEAD") && host && PREBUILT.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/s/${host}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-elevate-host", host);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // The upload proxy is excluded so large multipart bodies stream straight through (the proxy reads Host itself).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/proxy|brands/).*)"],
};
