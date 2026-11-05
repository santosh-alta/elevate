import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "@/lib/config";

export async function POST(req: Request) {
  (await cookies()).delete(TOKEN_COOKIE);
  return Response.redirect(new URL("/", req.url), 303);
}
