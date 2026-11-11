import type { Metadata } from "next";
import { getMe } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { PageHero } from "@/components/page-hero";
import { Card } from "@/components/ui";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Share feedback" };

export default async function FeedbackPage() {
  const [tenant, me] = await Promise.all([requireTenant(), getMe()]);
  return (
    <>
      <PageHero eyebrow="Help us improve" title="Tell us what you think" description={`You’re among the first to use ${tenant.name} Events. Your feedback decides what we build next.`} />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card className="p-6 sm:p-8">
          <FeedbackForm
            name={me?.user.name}
            email={me?.user.email}
            campuses={tenant.campuses.map((c) => c.city ? `${c.name} (${c.city})` : c.name)}
          />
        </Card>
      </div>
    </>
  );
}
