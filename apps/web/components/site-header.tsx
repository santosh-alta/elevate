import Link from "next/link";
import { Bell } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { getMe, isStaff } from "@/lib/auth";
import { apiList } from "@/lib/api";
import type { AppNotification } from "@/lib/types";
import { BrandLogo } from "./brand-logo";
import { buttonClass } from "./ui/button";

export async function SiteHeader() {
  const tenant = await requireTenant();
  const me = await getMe();
  const unread = me ? (await apiList<AppNotification>("/me/notifications?unread=1")).filter((n) => !n.readAt).length : 0;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo tenant={tenant} />
          <span className="font-semibold">{tenant.name} <span className="font-normal text-muted">Events</span></span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/events" className={buttonClass("ghost", "sm", "hidden sm:inline-flex")}>Events</Link>
          {me ? (
            <>
              <Link href="/me#notifications" className={buttonClass("ghost", "sm", "relative px-2")} aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
                <Bell className="h-4 w-4" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              <Link href="/me" className={buttonClass("ghost", "sm")}>My space</Link>
              {isStaff(me) && <Link href="/admin" className={buttonClass("secondary", "sm")}>Admin</Link>}
            </>
          ) : (
            <Link href="/login" className={buttonClass("primary", "sm")}>Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const tenant = await requireTenant();
  return (
    <footer className="mt-20 border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted sm:flex-row">
        <span>© {new Date().getFullYear()} {tenant.name}</span>
        <span className="text-xs">Powered by Elevate</span>
      </div>
    </footer>
  );
}
