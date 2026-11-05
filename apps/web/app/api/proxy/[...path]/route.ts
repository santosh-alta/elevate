import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { API_BASE, TOKEN_COOKIE } from "@/lib/config";
import { tenantHeaders } from "@/lib/tenant";

/** Same-origin proxy so the browser never talks to the API directly and the JWT stays httpOnly. */
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${API_BASE}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const headers: Record<string, string> = { ...(await tenantHeaders()) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const out = new Headers();
    for (const h of ["content-type", "content-disposition", "cache-control"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return Response.json({ error: "BadGateway", message: "Elevate API is unreachable" }, { status: 502 });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
