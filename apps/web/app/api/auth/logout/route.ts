import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/config";
import { getOrigin } from "@/lib/tenant";

/** Signs out: clears the session cookie and returns to the home page. */
export async function POST() {
  const res = NextResponse.redirect(`${await getOrigin()}/`, 303);
  res.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
}
