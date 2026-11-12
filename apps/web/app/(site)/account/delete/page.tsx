import type { Metadata } from "next";
import Link from "next/link";
import { getMe } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { PageHero } from "@/components/page-hero";
import { Card, LinkButton } from "@/components/ui";
import { DeleteAccountButton } from "./delete-button";

export const metadata: Metadata = { title: "Delete your account" };

/** Account deletion on the web (Google Play requires a web link as well as the in-app option). */
export default async function DeleteAccountPage() {
  const tenant = await requireTenant();
  const me = await getMe();
  return (
    <>
      <PageHero title="Delete your account" description={`Remove your ${tenant.name} Events account and personal details.`} size="sm" />
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card className="space-y-4 p-6 text-sm">
          <p><b>What gets deleted:</b> your name, email, phone, photo, profile links, sign-in, notifications, and your access to the website and app.</p>
          <p><b>What stays, without your name:</b> anonymous numbers from events you joined (attendance counts, team results), so event reports stay correct. Certificates already issued stop showing your name on our site.</p>
          <p>This can&apos;t be undone. You can also do this in the mobile app: Profile → Delete account.</p>
          {me ? (
            <>
              <p className="rounded-xl bg-bg px-3 py-2">Signed in as <b>{me.user.name}</b> ({me.user.email})</p>
              <DeleteAccountButton />
            </>
          ) : (
            <LinkButton href="/login?next=/account/delete" className="w-full">Sign in to delete your account</LinkButton>
          )}
          <p className="text-xs text-muted">Read our <Link href="/privacy" className="underline">privacy policy</Link>.</p>
        </Card>
      </div>
    </>
  );
}
