import Link from "next/link";
import { ArrowRight, Gavel } from "lucide-react";
import { apiList } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fmtRange } from "@/lib/format";
import { PageHero } from "@/components/page-hero";
import { Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Judging" };

type JudgeEvent = { id: string; slug: string; title: string; startsAt: string; endsAt: string; assignedTeams: number; submittedTeams: number };

/** Events this person judges. */
export default async function JudgeHome() {
  await requireUser("/judge");
  const events = await apiList<JudgeEvent>("/judge/events");
  return (
    <>
      <PageHero size="sm" eyebrow="Judging" title="Events you're judging" description="Pick an event, then a team, and give marks for each question." />
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-10">
        {events.length ? events.map((e) => (
          <Link key={e.id} href={`/judge/${e.slug}`} className="block">
            <Card className="flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gavel className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.title}</p>
                <p className="text-sm text-muted">{fmtRange(e.startsAt, e.endsAt)} · {e.submittedTeams} of {e.assignedTeams} teams scored</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted" />
            </Card>
          </Link>
        )) : <EmptyState title="You're not judging any events" description="When an organiser adds you as a judge, the event shows up here and you get an email." />}
      </div>
    </>
  );
}
