import { NextResponse, type NextRequest } from "next/server";

/** Forward the requested host so server components can resolve the brand (white-label). */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  headers.set("x-elevate-host", host);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // The upload proxy is excluded so large multipart bodies stream straight through (the proxy reads Host itself).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/proxy).*)"],
};
