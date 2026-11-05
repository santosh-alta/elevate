import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getMe, isStaff, requireUser } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { BrandLogo } from "@/components/brand-logo";
import { AdminNav } from "./admin-nav";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const tenant = await requireTenant();
  await requireUser("/admin");
  const me = await getMe();
  if (!isStaff(me)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">You don&apos;t have admin access</h1>
          <p className="mt-2 text-muted">Ask your brand admin to give you an event manager role.</p>
          <LinkButton href="/" className="mt-6" variant="outline">Back to events</LinkButton>
        </div>
      </main>
    );
  }
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r print:hidden">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <BrandLogo tenant={tenant} size={28} />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{tenant.name}</p>
            <p className="text-xs text-muted">Event operations</p>
          </div>
        </div>
        <AdminNav />
        <div className="hidden px-5 py-4 text-xs text-muted lg:absolute lg:bottom-0 lg:block">
          <p className="font-medium text-fg">{me!.user.name}</p>
          <p>{me!.user.isPlatformAdmin ? "Platform admin" : me!.membership?.role.replace(/_/g, " ").toLowerCase()}</p>
          <Link href="/" className="mt-2 inline-block text-primary hover:underline">View public site ↗</Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
