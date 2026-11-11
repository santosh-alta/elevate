"use client";

import { useCallback, useEffect, useState } from "react";
import { Expand, Loader2, MapPin, Smartphone, Users } from "lucide-react";
import { callApi } from "@/components/client/api";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/components/ui/cn";
import type { Tenant } from "@/lib/types";

type Code = {
  event: { title: string; slug: string; venue: string | null };
  qr: string; url: string; expiresIn: number; checkedIn: number; expected: number;
  geo: { lat: number; lng: number; radius: number } | null; notice: string | null;
};

/**
 * The QR changes every 30 seconds (so a forwarded photo stops working) and the count updates live.
 * Optional: require phones to be near this screen, using this device's location.
 */
export function Presenter({ event, tenant }: { event: string; tenant: Pick<Tenant, "name" | "theme"> }) {
  const [data, setData] = useState<Code | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [radius, setRadius] = useState(300);

  const load = useCallback(async () => {
    try {
      const d = await callApi<Code>("GET", `/events/${encodeURIComponent(event)}/attend/code`);
      setData(d); setLeft(d.expiresIn); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the check-in code");
    }
  }, [event]);

  // Refresh every 4 seconds (live count), and right after the QR changes.
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 4000);
    return () => clearInterval(poll);
  }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setLeft((s) => {
      if (s <= 1) { void load(); return 30; }
      return s - 1;
    }), 1000);
    return () => clearInterval(tick);
  }, [load]);

  async function setGeo(on: boolean) {
    setGeoBusy(true); setGeoMsg(null);
    try {
      let geo = null;
      if (on) {
        const p = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(res, () => rej(new Error("Allow location for this site on this device first.")), { enableHighAccuracy: true, timeout: 15_000 })
          : rej(new Error("This device can't share its location.")));
        geo = { lat: p.coords.latitude, lng: p.coords.longitude, radius };
      }
      await callApi("PUT", `/events/${encodeURIComponent(event)}/attend/location`, { geo });
      setGeoMsg(on ? `On: phones must be within about ${radius} m of this screen.` : "Off: anyone with the QR can check in.");
      void load();
    } catch (e) {
      setGeoMsg(e instanceof Error ? e.message : "Couldn't change the setting");
    } finally {
      setGeoBusy(false);
    }
  }

  const pct = data?.expected ? Math.min(100, Math.round((data.checkedIn / data.expected) * 100)) : 0;

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-hero-bg text-hero-fg">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-32 -top-32 h-[34rem] w-[34rem] animate-aurora rounded-full opacity-30 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
        <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] animate-aurora-slow rounded-full opacity-25 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
        <div className="bg-grid absolute inset-0" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <BrandLogo tenant={tenant} variant="dark" size={40} />
          <button type="button" onClick={() => void document.documentElement.requestFullscreen?.()} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">
            <Expand className="h-4 w-4" />Full screen
          </button>
        </header>

        {error && !data && <div className="m-auto max-w-lg rounded-2xl bg-white/10 p-6 text-center">{error}</div>}
        {!data && !error && <Loader2 className="m-auto h-10 w-10 animate-spin opacity-70" />}

        {data && (
          <main className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1fr_auto]">
            <div className="order-2 space-y-8 lg:order-1">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-hero-accent">Check in to</p>
                <h1 className="mt-2 font-heading text-4xl font-extrabold leading-tight lg:text-6xl">{data.event.title}</h1>
                {data.event.venue && <p className="mt-2 text-lg text-hero-fg/75">{data.event.venue}</p>}
              </div>
              <ol className="space-y-4 text-xl lg:text-2xl">
                <li className="flex items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10"><Smartphone className="h-6 w-6" /></span>Open your phone camera</li>
                <li className="flex items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold">QR</span>Point it at this code and tap the link</li>
                <li className="flex items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold">✓</span>You&rsquo;re checked in</li>
              </ol>
              <div className="max-w-md rounded-2xl bg-white/10 p-5">
                <p className="flex items-center gap-2 text-sm text-hero-fg/75"><Users className="h-4 w-4" />Checked in</p>
                <p className="mt-1 font-heading text-5xl font-extrabold">{data.checkedIn}<span className="text-2xl font-semibold text-hero-fg/60"> / {data.expected}</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-hero-accent transition-all duration-700" style={{ width: `${pct}%` }} /></div>
              </div>
              {data.notice && <p className="max-w-md rounded-xl bg-amber-400/20 px-4 py-3 text-sm text-amber-100">{data.notice} Students can scan, but check-in only works during the event.</p>}
            </div>

            <div className="order-1 mx-auto flex flex-col items-center lg:order-2">
              <div className="rounded-[2rem] bg-white p-5 shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qr} alt="Check-in QR code" className="h-[min(62vh,80vw)] w-[min(62vh,80vw)] max-w-[620px] max-h-[620px]" />
              </div>
              <div className="mt-4 w-full max-w-[400px]">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-hero-accent transition-[width] duration-1000 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
                </div>
                <p className="mt-2 text-center text-sm text-hero-fg/70">New code in {left}s · photos of this code stop working</p>
              </div>
            </div>
          </main>
        )}

        {data && (
          <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-sm text-hero-fg/75">
            <MapPin className="h-4 w-4" />
            <span>{data.geo ? `Location check on (within ~${data.geo.radius} m)` : "Location check off"}</span>
            {!data.geo && (
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="rounded-lg bg-white/10 px-2 py-1 text-hero-fg">
                {[150, 300, 500, 1000].map((r) => <option key={r} value={r} className="text-black">{r} m</option>)}
              </select>
            )}
            <button type="button" disabled={geoBusy} onClick={() => void setGeo(!data.geo)} className={cn("rounded-full px-3 py-1 font-semibold", data.geo ? "bg-white/10 hover:bg-white/15" : "bg-hero-accent text-hero-bg hover:opacity-90")}>
              {geoBusy ? "…" : data.geo ? "Turn off" : "Require being here"}
            </button>
            {geoMsg && <span>{geoMsg}</span>}
          </footer>
        )}
      </div>
    </div>
  );
}
