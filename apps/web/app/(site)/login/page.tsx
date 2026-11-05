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
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo tenant={tenant} size={44} />
          <h1 className="mt-4 text-xl font-semibold">Sign in to {tenant.name} Events</h1>
          <p className="mt-1 text-sm text-muted">We&apos;ll email you a one-time code. No password needed.</p>
        </div>
        <LoginForm next={safeNext} />
      </Card>
    </div>
  );
}
