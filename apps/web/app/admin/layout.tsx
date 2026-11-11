import type { Metadata } from "next";
import { ChatWidget } from "@/components/client/chat-widget";
import { SiteTour, TourButton } from "@/components/client/site-tour";
import { adminTour } from "@/lib/tours";
import { ThemeToggle } from "@/components/client/theme-toggle";
import Link from "next/link";
import type { ReactNode } from "react";
import { resolveTheme } from "@elevate/shared";
import { canUseAdmin, getMe, isBrandAdmin, isReviewer, isStaff, requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@elevate/shared";
import { getOrigin, getTenant, requireTenant } from "@/lib/tenant";
import { BrandRoot } from "@/components/brand-root";
import { brandMetadata } from "@/lib/brand-meta";
import { BrandLogo } from "@/components/brand-logo";
import { AdminNav } from "./admin-nav";
import { AccountMenu } from "@/components/client/account-menu";
import { Avatar } from "@/components/avatar";
import { LinkButton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getOrigin()]);
  return { ...brandMetadata(tenant, origin), title: { default: "Admin", template: "%s · Admin" } };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const tenant = await requireTenant();
  return <BrandRoot tenant={tenant}><AdminShell>{children}</AdminShell></BrandRoot>;
}

async function AdminShell({ children }: { children: ReactNode }) {
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
      <aside className="relative isolate overflow-hidden bg-hero-bg text-hero-fg lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col print:hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-20 -top-20 h-64 w-64 animate-aurora rounded-full opacity-35 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
          <div className="absolute -bottom-24 -right-16 h-56 w-56 animate-aurora-slow rounded-full opacity-25 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
          <div className="bg-grid absolute inset-0 opacity-70" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-1" aria-hidden />
        <Link href="/admin" className="flex h-16 items-center gap-3 px-5 lg:h-20" aria-label={`${tenant.name} admin dashboard`}>
          <BrandLogo tenant={tenant} variant="dark" size={30} />
          {!theme.logoDarkUrl && <span className="truncate font-heading text-sm font-bold">{tenant.name}</span>}
        </Link>
        <p className="hidden px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-hero-fg/80 lg:block">Event operations</p>
        <AdminNav staff={isStaff(me)} reviewer={isReviewer(me)} admin={isBrandAdmin(me)} />
        <div className="hidden border-t border-hero-fg/15 px-5 py-4 text-xs text-hero-fg/80 lg:mt-auto lg:block">
          <div className="flex items-center gap-2.5">
            <Avatar name={me!.user.name} url={me!.user.avatarUrl} size={34} className="ring-hero-fg/30" />
            <div className="min-w-0">
              <p className="truncate font-medium text-hero-fg">{me!.user.name}</p>
              <p>{me!.user.isPlatformAdmin ? "Super admin" : me!.membership ? ROLE_LABELS[me!.membership.role] : ""}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/" className="font-medium text-hero-fg underline decoration-accent decoration-2 underline-offset-4">Public site ↗</Link>
            <Link href="/profile?next=/admin" className="font-medium text-hero-fg hover:underline">Profile</Link>
            <form action="/api/auth/logout" method="post"><button type="submit" className="font-medium text-hero-fg hover:underline">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-10 sm:px-8">
        <div className="sticky top-0 z-20 -mx-4 mb-6 flex items-center justify-end gap-3 border-b border-border/70 bg-bg/75 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 print:hidden">
          <TourButton className="text-sm text-muted hover:text-fg">Tour</TourButton>
          <Link href="/" className="text-sm text-muted hover:text-fg">View public site ↗</Link>
          <ThemeToggle />
          <AccountMenu
            name={me!.user.name}
            email={me!.user.email}
            avatarUrl={me!.user.avatarUrl}
            roleLabel={me!.user.isPlatformAdmin ? "Super admin" : me!.membership ? ROLE_LABELS[me!.membership.role] : null}
            showAdmin={false}
          />
        </div>
        {children}
      </main>
      <ChatWidget />
      <SiteTour id="admin" steps={adminTour(tenant.name.split(" ")[0])} />
    </div>
  );
}
