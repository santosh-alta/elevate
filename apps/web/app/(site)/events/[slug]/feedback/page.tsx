import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { PageHero } from "@/components/page-hero";
import { Card } from "@/components/ui";
import { FeedbackForm } from "./feedback-form";

export const metadata = { title: "Event feedback" };

type Mine = { event: { id: string; slug: string; title: string; startsAt: string; mode: string }; registered: boolean; submitted: boolean; open: boolean };

/** Opened from the "How was it?" email after the event. */
export default async function EventFeedbackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUser(`/events/${slug}/feedback`);
  const mine = await apiGet<Mine>(`/events/${encodeURIComponent(slug)}/feedback/mine`);
  if (!mine) notFound();
  const { event } = mine;
  return (
    <>
      <PageHero size="sm" eyebrow="Your feedback" title={event.title} description="Tell us how it went. It takes under a minute and shapes the next one." />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card className="p-6 shadow-lift sm:p-8">
          {mine.submitted ? (
            <Note title="Thank you!" text="We've got your feedback for this event." />
          ) : !mine.registered ? (
            <Note title="Only participants can give feedback" text="You weren't registered for this event with this account." />
          ) : !mine.open ? (
            <Note title="Feedback isn't open yet" text="It opens once the event has started." />
          ) : (
            <FeedbackForm eventId={event.id} online={event.mode === "ONLINE"} />
          )}
          <p className="mt-6 text-center text-sm"><Link href={`/events/${event.slug}`} className="text-primary hover:underline">Back to the event page</Link></p>
        </Card>
      </div>
    </>
  );
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-6 text-center">
      <p className="font-heading text-2xl font-bold">{title}</p>
      <p className="mt-2 text-muted">{text}</p>
    </div>
  );
}
