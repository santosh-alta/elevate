"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin, XCircle } from "lucide-react";
import { callApi } from "@/components/client/api";

type Result = { status: "checked_in" | "already"; name: string; checkedInAt: string; event: { title: string; slug: string } };

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This phone can't share its location. Please go to the help desk."));
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location is needed to confirm you're at the venue. Allow location for this site and try again.")), {
      enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000,
    });
  });
}

/** Checks the signed-in student in as soon as the page opens (asking for location first when the event needs it). */
export function AttendClient({ event, pass, needsLocation, title, name }: {
  event: string; pass: string; needsLocation: boolean; title: string | null; name: string;
}) {
  const [state, setState] = useState<"working" | "locating" | "done" | "error">(needsLocation ? "locating" : "working");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setError(null);
    try {
      let geo: { lat?: number; lng?: number; accuracy?: number } = {};
      if (needsLocation) {
        setState("locating");
        const p = await position();
        geo = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      }
      setState("working");
      const r = await callApi<Result>("POST", `/events/${encodeURIComponent(event)}/attend`, { pass, ...geo });
      setResult(r);
      setState("done");
      try { navigator.vibrate?.(120); } catch { /* not supported */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check you in");
      setState("error");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const time = result ? new Date(result.checkedInAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      {(state === "working" || state === "locating") && (
        <>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            {state === "locating" ? <MapPin className="h-9 w-9 animate-pulse text-primary" /> : <Loader2 className="h-9 w-9 animate-spin text-primary" />}
          </span>
          <h1 className="mt-6 font-heading text-2xl font-bold">{state === "locating" ? "Confirming you're at the venue…" : "Checking you in…"}</h1>
          <p className="mt-2 text-muted">{state === "locating" ? "Allow location when your phone asks." : title ?? ""}</p>
        </>
      )}

      {state === "done" && result && (
        <>
          <span className="flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-emerald-500 text-white shadow-lift">
            <CheckCircle2 className="h-14 w-14" />
          </span>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-emerald-600">{result.status === "already" ? "Already checked in" : "You're checked in"}</p>
          <h1 className="mt-1 font-heading text-3xl font-extrabold">{result.name.split(" ")[0]}, welcome!</h1>
          <p className="mt-2 text-lg font-semibold">{result.event.title}</p>
          <p className="mt-1 text-sm text-muted">{result.status === "already" ? `Checked in at ${time}` : `Attendance recorded at ${time}`}</p>
          <p className="mt-6 rounded-xl bg-bg px-4 py-3 text-sm text-muted">Your certificate will appear under <Link href="/me" className="font-semibold text-primary">My events</Link> after the event.</p>
        </>
      )}

      {state === "error" && (
        <>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600"><XCircle className="h-10 w-10" /></span>
          <h1 className="mt-6 font-heading text-2xl font-bold">Not checked in yet</h1>
          <p className="mt-2 text-muted">{error}</p>
          <p className="mt-1 text-xs text-muted">Signed in as {name}</p>
          <button type="button" onClick={() => void run()} className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-fg">Try again</button>
        </>
      )}
    </div>
  );
}
