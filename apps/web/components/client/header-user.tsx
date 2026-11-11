"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADMIN_AREA_ROLES, ROLE_LABELS, type Role } from "@elevate/shared";
import { AccountMenu } from "./account-menu";
import { NotificationBell } from "./notification-bell";
import { buttonClass } from "../ui/button";

type Me = { user: { name: string; email: string; avatarUrl?: string | null; isPlatformAdmin?: boolean }; membership: { role: Role } | null };

/**
 * Signed-in part of the header, loaded in the browser. Lets public pages be pre-built and shared by everyone,
 * while each visitor still sees their own photo and notifications.
 */
export function HeaderUser() {
  const [state, setState] = useState<{ me: Me | null; unread: number } | "loading">("loading");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/proxy/me", { cache: "no-store" });
        if (!res.ok) { if (alive) setState({ me: null, unread: 0 }); return; }
        const me = (await res.json()) as Me;
        const n = await fetch("/api/proxy/me/notifications?unread=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (alive) setState({ me, unread: Array.isArray(n) ? n.filter((x: { readAt?: string | null }) => !x.readAt).length : 0 });
      } catch {
        if (alive) setState({ me: null, unread: 0 });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state === "loading") return <span aria-hidden className="h-9 w-[84px] animate-pulse rounded-full bg-primary/5" />;
  if (!state.me) return <Link href="/login" className={buttonClass("primary", "sm", "px-4")}>Sign in</Link>;
  const { me, unread } = state;
  const admin = !!me.user.isPlatformAdmin || (!!me.membership && ADMIN_AREA_ROLES.includes(me.membership.role));
  return (
    <>
      <NotificationBell initialUnread={unread} />
      <AccountMenu
        name={me.user.name}
        email={me.user.email}
        avatarUrl={me.user.avatarUrl}
        roleLabel={me.user.isPlatformAdmin ? "Super admin" : me.membership && me.membership.role !== "STUDENT" ? ROLE_LABELS[me.membership.role] : null}
        showAdmin={admin}
      />
    </>
  );
}
