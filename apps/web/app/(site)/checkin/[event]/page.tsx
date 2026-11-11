import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { CheckinDesk, type DeskInfo } from "./desk";

export const metadata = { title: "Check-in" };

/**
 * Check-in desk for volunteers and organisers: scan tickets with the phone camera, or search by name.
 * Works in any phone browser; no app needed.
 */
export default async function CheckinPage({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  await requireUser(`/checkin/${event}`);
  const desk = await apiGet<DeskInfo>(`/events/${encodeURIComponent(event)}/checkin/desk`);
  if (!desk) notFound();
  return <CheckinDesk initial={desk} />;
}
