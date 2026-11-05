import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/config";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await apiFetch<{ token: string; user: unknown }>("/auth/otp/verify", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok || !r.data?.token) return Response.json({ message: r.error ?? "Invalid code" }, { status: r.status || 401 });
  (await cookies()).set(TOKEN_COOKIE, r.data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ user: r.data.user });
}
