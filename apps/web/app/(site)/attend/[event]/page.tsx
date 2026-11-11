import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { AttendClient } from "./attend-client";

export const metadata = { title: "Check in" };

type Start = { event: { title: string; slug: string }; pass: string; needsLocation: boolean };

/**
 * Opened by scanning the live QR on the event screen. The short-lived QR code is swapped for a 10-minute pass
 * first, so signing in on the phone doesn't make it expire; then the student is checked in with one tap.
 */
export default async function AttendPage({ params, searchParams }: {
  params: Promise<{ event: string }>; searchParams: Promise<{ t?: string; p?: string; g?: string }>;
}) {
  const { event } = await params;
  const { t, p, g } = await searchParams;

  let pass = p;
  let needsLocation = g === "1";
  let title: string | null = null;
  if (t) {
    const start = await apiGet<Start>(`/events/${encodeURIComponent(event)}/attend/start?t=${encodeURIComponent(t)}`);
    if (!start) return <Expired />;
    pass = start.pass;
    needsLocation = start.needsLocation;
    title = start.event.title;
  }
  if (!pass) return <Expired />;

  const back = `/attend/${event}?p=${encodeURIComponent(pass)}&g=${needsLocation ? 1 : 0}`;
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(back)}`);
  // A fresh scan replaces the code in the address, so a refresh or a shared screenshot of the page can't reuse it.
  if (t) redirect(back);

  return <AttendClient event={event} pass={pass} needsLocation={needsLocation} title={title} name={me.user.name} />;
}

function Expired() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-hero-bg text-hero-accent"><QrCode className="h-8 w-8" /></span>
      <h1 className="mt-5 font-heading text-2xl font-bold">Scan the screen again</h1>
      <p className="mt-2 text-muted">The check-in QR changes every 30 seconds. Point your phone camera at the QR on the screen once more.</p>
    </div>
  );
}
