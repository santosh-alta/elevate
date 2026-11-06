import type { NextRequest } from "next/server";
import { API_BASE } from "@/lib/config";

/** Uploaded files come back from the API as relative "/files/..." URLs; serve them from the brand domain. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    const res = await fetch(`${API_BASE}/files/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, { cache: "no-store" });
    const out = new Headers();
    for (const h of ["content-type", "content-length", "content-disposition", "cache-control", "etag", "last-modified"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    if (!out.has("cache-control") && res.ok) out.set("cache-control", "public, max-age=86400");
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return new Response("File unavailable", { status: 502 });
  }
}
