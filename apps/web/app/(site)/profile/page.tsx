import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { Card } from "@/components/ui";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

/** One-time profile page after first sign-in; later reachable from "My events" to edit. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/me";
  const [me, tenant] = await Promise.all([requireUser(`/profile?next=${encodeURIComponent(safeNext)}`), requireTenant()]);
  const first = !me.user.profileCompletedAt;
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" aria-hidden />
        <h1 className="font-heading text-2xl font-bold tracking-tight">{first ? `Welcome to ${tenant.name} Events` : "Your profile"}</h1>
        <p className="mt-1 text-sm text-muted">
          {first ? "Tell us a little about yourself. It takes a minute and you only do it once." : "Keep your details up to date. Your name appears on certificates."}
        </p>
        <ProfileForm user={me.user} next={safeNext} first={first} />
      </Card>
    </div>
  );
}
