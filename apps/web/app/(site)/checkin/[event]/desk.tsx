"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Loader2, Search, Undo2, Users, XCircle } from "lucide-react";
import { callApi } from "@/components/client/api";
import { cn } from "@/components/ui/cn";

export type DeskInfo = {
  event: { id: string; slug: string; title: string; startsAt: string; endsAt: string; venue: string | null; mode: string };
  checkedIn: number; expected: number; waitlisted: number; canUndo: boolean;
};
type Person = { id: string; name: string; email?: string; avatarUrl?: string | null };
type Team = { id: string; name: string; members?: number } | null;
type ScanResult = {
  registration: { id: string; status: string; checkedInAt: string | null };
  user: Person; alreadyCheckedIn: boolean; warning?: string; checkedInCount?: number; team?: Team;
};
type Hit = { id: string; ticketCode: string; shortCode: string; status: string; checkedInAt: string | null; user: Person; team: Team };
type Flash =
  | { kind: "ok" | "again"; name: string; detail?: string; warning?: string; registrationId: string; team?: Team }
  | { kind: "error"; message: string };

const time = (d: string | null) => (d ? new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");

function feedback(ok: boolean) {
  try { navigator.vibrate?.(ok ? 80 : [60, 60, 60]); } catch { /* not supported */ }
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
  } catch { /* no audio */ }
}

export function CheckinDesk({ initial }: { initial: DeskInfo }) {
  const [desk, setDesk] = useState(initial);
  const [mode, setMode] = useState<"scan" | "search">("scan");
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const eventId = desk.event.id;

  const refresh = useCallback(async () => {
    try { setDesk(await callApi<DeskInfo>("GET", `/events/${eventId}/checkin/desk`)); } catch { /* keep old numbers */ }
  }, [eventId]);

  const checkIn = useCallback(async (ticketCode: string) => {
    setBusy(true);
    try {
      const r = await callApi<ScanResult>("POST", "/checkin", { ticketCode, eventId });
      setFlash({
        kind: r.alreadyCheckedIn ? "again" : "ok", name: r.user.name, registrationId: r.registration.id, warning: r.warning, team: r.team ?? null,
        detail: r.alreadyCheckedIn ? `Already checked in at ${time(r.registration.checkedInAt)}` : r.team ? `Team ${r.team.name}` : undefined,
      });
      feedback(!r.alreadyCheckedIn);
      void refresh();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Couldn't check in" });
      feedback(false);
    } finally {
      setBusy(false);
    }
  }, [eventId, refresh]);

  async function checkInTeam(teamId: string) {
    setBusy(true);
    try {
      const r = await callApi<{ team: { name: string }; checkedInNow: string[] }>("POST", "/checkin/team", { eventId, teamId });
      setFlash({ kind: "ok", name: `Team ${r.team.name}`, registrationId: "", detail: r.checkedInNow.length ? `Checked in: ${r.checkedInNow.join(", ")}` : "Everyone in this team was already checked in" });
      feedback(true);
      void refresh();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Couldn't check in the team" });
    } finally {
      setBusy(false);
    }
  }

  async function undo(registrationId: string) {
    if (!window.confirm("Undo this check-in?")) return;
    try {
      await callApi("POST", "/checkin/undo", { registrationId });
      setFlash(null);
      void refresh();
    } catch (e) {
      setFlash({ kind: "error", message: e instanceof Error ? e.message : "Couldn't undo" });
    }
  }

  const pct = desk.expected ? Math.round((desk.checkedIn / desk.expected) * 100) : 0;

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="rounded-2xl bg-hero-bg p-5 text-hero-fg shadow-lift">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-hero-accent">Check-in desk</p>
        <h1 className="mt-1 font-heading text-xl font-bold leading-tight">{desk.event.title}</h1>
        <div className="mt-4 flex items-end justify-between gap-3">
          <p><span className="font-heading text-4xl font-extrabold">{desk.checkedIn}</span><span className="text-hero-fg/70"> / {desk.expected} checked in</span></p>
          <p className="text-sm text-hero-fg/80">{pct}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-hero-accent transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-bg p-1 text-sm font-semibold">
        {([["scan", "Scan QR", Camera], ["search", "Search by name", Search]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={cn("flex items-center justify-center gap-2 rounded-lg py-2.5", mode === k ? "bg-card text-primary shadow-sm" : "text-muted")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {flash && <FlashCard flash={flash} canUndo={desk.canUndo} busy={busy} onUndo={undo} onTeam={checkInTeam} onClose={() => setFlash(null)} />}

      <div className="mt-4">
        {mode === "scan" ? <Scanner onCode={checkIn} paused={busy} /> : <SearchPanel eventId={eventId} onCheckIn={checkIn} onTeam={checkInTeam} busy={busy} />}
      </div>
    </div>
  );
}

function FlashCard({ flash, canUndo, busy, onUndo, onTeam, onClose }: {
  flash: Flash; canUndo: boolean; busy: boolean; onUndo: (id: string) => void; onTeam: (id: string) => void; onClose: () => void;
}) {
  if (flash.kind === "error") {
    return (
      <div className="mt-4 flex animate-pop-in items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
        <XCircle className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="flex-1"><p className="font-bold">Not checked in</p><p className="text-sm">{flash.message}</p></div>
        <button type="button" onClick={onClose} className="text-xs font-semibold underline">OK</button>
      </div>
    );
  }
  const ok = flash.kind === "ok";
  return (
    <div className={cn("mt-4 animate-pop-in rounded-2xl border p-4", ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
      <div className="flex items-start gap-3">
        {ok ? <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-600" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide">{ok ? "Checked in" : "Already checked in"}</p>
          <p className="truncate text-lg font-bold">{flash.name}</p>
          {flash.detail && <p className="text-sm">{flash.detail}</p>}
          {flash.warning && <p className="mt-1 text-sm font-semibold text-amber-700">⚠ {flash.warning}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold underline">Next</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {flash.team?.id && (flash.team.members ?? 0) > 1 && (
          <button type="button" disabled={busy} onClick={() => onTeam(flash.team!.id)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            <Users className="h-3.5 w-3.5" />Check in whole team ({flash.team.members})
          </button>
        )}
        {canUndo && ok && flash.registrationId && (
          <button type="button" onClick={() => onUndo(flash.registrationId)} className="inline-flex items-center gap-1.5 rounded-full border border-current/30 px-3 py-1.5 text-xs font-semibold">
            <Undo2 className="h-3.5 w-3.5" />Undo
          </button>
        )}
      </div>
    </div>
  );
}

/** Camera scanner: reads QR codes from the back camera a few times a second (works on Android and iPhone browsers). */
function Scanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const pausedRef = useRef(paused);
  const [state, setState] = useState<"idle" | "starting" | "on" | "denied" | "unsupported">("idle");
  pausedRef.current = paused;

  useEffect(() => {
    if (state !== "starting") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState("unsupported"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState("on");
        timer = setInterval(() => {
          const c = canvas.current;
          if (!c || !v.videoWidth || pausedRef.current) return;
          const scale = Math.min(1, 640 / v.videoWidth);
          c.width = v.videoWidth * scale;
          c.height = v.videoHeight * scale;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          const code = hit?.data?.trim();
          if (!code) return;
          const now = Date.now();
          if (code === last.current.code && now - last.current.at < 4000) return; // same ticket held in front of the camera
          last.current = { code, at: now };
          onCode(code);
        }, 250);
      } catch {
        setState("denied");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [state, onCode]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black shadow-soft">
        <video ref={video} playsInline muted className={cn("h-full w-full object-cover", state !== "on" && "hidden")} />
        <canvas ref={canvas} className="hidden" />
        {state === "on" && (
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
            {paused && <div className="flex h-full items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-white" /></div>}
          </div>
        )}
        {state !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {state === "denied" || state === "unsupported" ? <CameraOff className="h-10 w-10 opacity-80" /> : <Camera className="h-10 w-10 opacity-80" />}
            <p className="text-sm opacity-90">
              {state === "denied" ? "Camera access was blocked. Allow the camera for this site in your browser settings, or use Search by name."
                : state === "unsupported" ? "This browser can't use the camera. Use Search by name instead."
                  : "Point the camera at the QR code on the ticket."}
            </p>
            {(state === "idle" || state === "denied") && (
              <button type="button" onClick={() => setState("starting")} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">
                {state === "denied" ? "Try again" : "Start camera"}
              </button>
            )}
            {state === "starting" && <Loader2 className="h-6 w-6 animate-spin" />}
          </div>
        )}
      </div>
      {state === "on" && <button type="button" onClick={() => setState("idle")} className="w-full rounded-xl border border-border py-2 text-sm font-medium text-muted">Stop camera</button>}
      <ManualCode onCode={onCode} />
    </div>
  );
}

function ManualCode({ onCode }: { onCode: (code: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onCode(v.trim()); setV(""); } }} className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Or type the full ticket code" className="h-11 flex-1 rounded-xl border border-border bg-card px-3 font-mono text-sm focus:border-primary focus:outline-none" />
      <button type="submit" className="rounded-xl bg-primary px-4 text-sm font-semibold text-white">Check in</button>
    </form>
  );
}

function SearchPanel({ eventId, onCheckIn, onTeam, busy }: { eventId: string; onCheckIn: (code: string) => Promise<void>; onTeam: (teamId: string) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async (term: string) => {
    if (term.trim().length < 2) { setHits(null); return; }
    setLoading(true); setErr(null);
    try { setHits(await callApi<Hit[]>("GET", `/events/${eventId}/checkin/search?q=${encodeURIComponent(term.trim())}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => {
    const t = setTimeout(() => void run(q), 300);
    return () => clearTimeout(t);
  }, [q, run]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, phone or ticket no."
          className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-base focus:border-primary focus:outline-none"
        />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {hits && !hits.length && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">No registrations match “{q}”.</p>}
      <ul className="space-y-2">
        {hits?.map((h) => {
          const done = h.status === "CHECKED_IN";
          return (
            <li key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{h.user.name}</p>
                <p className="truncate text-xs text-muted">{h.user.email} · #{h.shortCode}</p>
                {h.team && <p className="truncate text-xs font-medium text-primary">Team {h.team.name}</p>}
                {h.status === "WAITLISTED" && <p className="text-xs font-semibold text-amber-700">On the waitlist</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {done ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{time(h.checkedInAt)}</span>
                ) : (
                  <button
                    type="button" disabled={busy}
                    onClick={async () => { await onCheckIn(h.ticketCode); void run(q); }}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >Check in</button>
                )}
                {h.team && <button type="button" disabled={busy} onClick={() => { onTeam(h.team!.id); setTimeout(() => void run(q), 600); }} className="text-[11px] font-semibold text-primary underline disabled:opacity-50">Whole team</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
