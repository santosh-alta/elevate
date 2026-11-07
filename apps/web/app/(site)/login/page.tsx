import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { BrandLogo } from "@/components/brand-logo";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/me";
  if (await getMe()) redirect(safeNext);
  const tenant = await requireTenant();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="relative w-full max-w-sm overflow-hidden p-8 pt-9 shadow-lg">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" aria-hidden />
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo tenant={tenant} size={44} />
          <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight">Sign in to {tenant.name} Events</h1>
          <p className="mt-1 text-sm text-muted">We&apos;ll email you a one-time code. No password needed.</p>
        </div>
        <LoginForm next={safeNext} />
      </Card>
    </div>
  );
}
