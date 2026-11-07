import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { resolveTheme } from "@elevate/shared";
import { canUseAdmin, getMe, isBrandAdmin, isReviewer, isStaff, requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@elevate/shared";
import { requireTenant } from "@/lib/tenant";
import { BrandLogo } from "@/components/brand-logo";
import { AdminNav } from "./admin-nav";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const tenant = await requireTenant();
  const theme = resolveTheme(tenant.theme);
  await requireUser("/admin");
  const me = await getMe();
  if (!canUseAdmin(me)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">You don&apos;t have admin access</h1>
          <p className="mt-2 text-muted">To create event pages, ask an admin to make you an organizer.</p>
          <LinkButton href="/" className="mt-6" variant="outline">Back to events</LinkButton>
        </div>
      </main>
    );
  }
  return (
    <div className="min-h-screen lg:flex">
      <aside className="relative bg-hero-bg text-hero-fg lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col print:hidden">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-1" aria-hidden />
        <Link href="/admin" className="flex h-16 items-center gap-3 px-5 lg:h-20" aria-label={`${tenant.name} admin dashboard`}>
          <BrandLogo tenant={tenant} variant="dark" size={30} />
          {!theme.logoDarkUrl && <span className="truncate font-heading text-sm font-bold">{tenant.name}</span>}
        </Link>
        <p className="hidden px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-hero-fg/80 lg:block">Event operations</p>
        <AdminNav staff={isStaff(me)} reviewer={isReviewer(me)} admin={isBrandAdmin(me)} />
        <div className="hidden border-t border-hero-fg/15 px-5 py-4 text-xs text-hero-fg/80 lg:mt-auto lg:block">
          <p className="font-medium text-hero-fg">{me!.user.name}</p>
          <p>{me!.user.isPlatformAdmin ? "Super admin" : me!.membership ? ROLE_LABELS[me!.membership.role] : ""}</p>
          <Link href="/" className="mt-2 inline-block font-medium text-hero-fg underline decoration-accent decoration-2 underline-offset-4">View public site ↗</Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
