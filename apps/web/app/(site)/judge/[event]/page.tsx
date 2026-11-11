import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { JudgeBoard, type JudgeView } from "./judge-board";

export const metadata = { title: "Judging" };

/** Scoring page for one event: pick a team, give marks per question, add comments, submit. */
export default async function JudgeEventPage({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  await requireUser(`/judge/${event}`);
  const view = await apiGet<JudgeView>(`/judge/events/${encodeURIComponent(event)}`);
  if (!view) notFound();
  return <JudgeBoard initial={view} />;
}
