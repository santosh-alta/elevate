import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_AREA_ROLES, REVIEWER_ROLES, STAFF_ROLES } from "@elevate/shared";
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

/** Can open /admin at all (staff, or organizers who only see their own events). */
export function canUseAdmin(me: Me | null): boolean {
  if (!me) return false;
  if (me.user.isPlatformAdmin) return true;
  return !!me.membership && ADMIN_AREA_ROLES.includes(me.membership.role);
}

/** Admins and moderators approve organizers' event pages. */
export function isReviewer(me: Me | null): boolean {
  if (!me) return false;
  if (me.user.isPlatformAdmin) return true;
  return !!me.membership && REVIEWER_ROLES.includes(me.membership.role);
}

/** An organizer without staff rights: sees only their own events in the admin area. */
export function isOrganizerOnly(me: Me | null): boolean {
  return !!me && !me.user.isPlatformAdmin && me.membership?.role === "ORGANIZER";
}

/** For staff-only admin pages: sends organizers to their events instead. */
export async function requireStaffPage(): Promise<Me> {
  const me = await requireUser("/admin");
  if (!isStaff(me)) redirect("/admin/events");
  return me;
}

export function isBrandAdmin(me: Me | null): boolean {
  return !!me && (!!me.user.isPlatformAdmin || me.membership?.role === "BRAND_ADMIN");
}

export async function requireUser(next: string): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  return me;
}
