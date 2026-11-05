import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_ROLES } from "@elevate/shared";
import { TOKEN_COOKIE } from "./config";
import { apiGet } from "./api";
import type { Me } from "./types";

export const getMe = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return apiGet<Me>("/me");
});

export function isStaff(me: Me | null): boolean {
  if (!me) return false;
  if (me.user.isPlatformAdmin) return true;
  return !!me.membership && STAFF_ROLES.includes(me.membership.role);
}

export function isBrandAdmin(me: Me | null): boolean {
  return !!me && (!!me.user.isPlatformAdmin || me.membership?.role === "BRAND_ADMIN");
}

export async function requireUser(next: string): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  return me;
}
