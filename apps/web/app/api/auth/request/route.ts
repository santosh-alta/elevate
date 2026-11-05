import { apiFetch } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await apiFetch<{ ok: boolean; devCode?: string }>("/auth/otp/request", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) return Response.json({ message: r.error ?? "Could not send code" }, { status: r.status || 502 });
  return Response.json(r.data);
}
