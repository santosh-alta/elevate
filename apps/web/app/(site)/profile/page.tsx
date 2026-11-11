import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { Card } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { ProfileForm } from "./profile-form";
import { PhotoEditor } from "./photo-editor";

export const metadata: Metadata = { title: "Your profile" };

/** One-time profile page after first sign-in; later reachable from "My events" to edit. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/me";
  const [me, tenant] = await Promise.all([requireUser(`/profile?next=${encodeURIComponent(safeNext)}`), requireTenant()]);
  const first = !me.user.profileCompletedAt;
  return (
    <>
      <PageHero
        size="sm"
        eyebrow={first ? "Almost there" : "Your profile"}
        title={first ? `Welcome to ${tenant.name} Events` : "Your profile"}
        description={first ? "Tell us a little about yourself. It takes a minute and you only do it once." : "Keep your details up to date. Your name appears on certificates."}
      />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card className="animate-fade-up p-6 shadow-lift sm:p-8">
          <div className="rounded-brand border border-border/80 bg-bg/50 p-4">
            <p className="mb-3 text-sm font-medium">Profile photo</p>
            <PhotoEditor name={me.user.name} avatarUrl={me.user.avatarUrl} />
          </div>
          <ProfileForm user={me.user} next={safeNext} first={first} />
        </Card>
      </div>
    </>
  );
}
