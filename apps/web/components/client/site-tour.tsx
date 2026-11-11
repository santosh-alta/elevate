"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

/**
 * Guided tour: dims the page, spotlights one element at a time and explains it.
 * Elements are found by `data-tour="<target>"`; steps whose element is missing or hidden (another role,
 * a phone layout) are skipped, so one list of steps works for everyone. A step without a target is a
 * centred welcome card. Shown once per browser (remembered in localStorage) and replayed with <TourButton>.
 */
export type TourStep = { target?: string; title: string; body: string };

const START_EVENT = "site-tour:start";
const seenKey = (id: string) => `tour:${id}:v1`;

function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

/** `autoStartOn`: regex source of paths where a first-time visitor gets the tour automatically (default: anywhere). */
export function SiteTour({ id, steps, autoStart = true, autoStartOn }: { id: string; steps: TourStep[]; autoStart?: boolean; autoStartOn?: string }) {
  const [active, setActive] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);

  const start = useCallback(() => {
    const usable = steps.filter((s) => !s.target || findTarget(s.target));
    if (!usable.length) return;
    setI(0);
    setActive(usable);
  }, [steps]);

  const finish = useCallback(() => {
    setActive(null);
    try { localStorage.setItem(seenKey(id), new Date().toISOString()); } catch { /* private mode */ }
  }, [id]);

  // First visit: start after the page settles. Replay: any <TourButton> on the page.
  useEffect(() => {
    let seen = false;
    try { seen = !!localStorage.getItem(seenKey(id)); } catch { seen = true; }
    const here = !autoStartOn || new RegExp(autoStartOn).test(window.location.pathname);
    const t = autoStart && here && !seen && !/bot|crawl|spider|headless/i.test(navigator.userAgent) ? window.setTimeout(start, 1200) : undefined;
    const onStart = () => start();
    window.addEventListener(START_EVENT, onStart);
    return () => { window.clearTimeout(t); window.removeEventListener(START_EVENT, onStart); };
  }, [id, autoStart, autoStartOn, start]);

  const step = active?.[i];

  // Bring the element into view, then follow it while the page scrolls or resizes.
  useEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const timers = [120, 300, 600].map((ms) => window.setTimeout(update, ms));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [step]);

  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); }, [step, rect]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setI((n) => (n + 1 < active.length ? n + 1 : n));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, finish]);

  useEffect(() => { cardRef.current?.focus(); }, [i, active]);

  if (!active || !step) return null;
  const last = i === active.length - 1;
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 24);

  // Card below the element if it fits, otherwise above; centred when there is no element.
  let style: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + pad + 12;
    const top = below + cardH < vh - 12 ? below : Math.max(12, rect.top - pad - 12 - cardH);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
    style = { top, left, width: cardW };
  } else {
    style = { top: Math.max(12, vh / 2 - cardH / 2), left: vw / 2 - cardW / 2, width: cardW };
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Site tour">
      {/* Click-catcher behind the spotlight, so the page isn't used by accident mid-tour. */}
      <div className="absolute inset-0" onClick={finish} />
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-300 ease-out"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgb(10 12 30 / 0.62)" }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[rgb(10_12_30/0.62)]" />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="animate-pop-in absolute rounded-brand border border-border bg-card p-5 text-fg shadow-lift outline-none transition-[top,left] duration-300 ease-out"
        style={style}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            <Compass className="h-3.5 w-3.5" />Step {i + 1} of {active.length}
          </p>
          <button type="button" onClick={finish} aria-label="Close tour" className="-m-1 rounded-lg p-1 text-muted hover:bg-fg/5 hover:text-fg"><X className="h-4 w-4" /></button>
        </div>
        <h2 className="mt-2 font-heading text-lg font-bold leading-snug">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg/80">{step.body}</p>
        <div className="mt-4 flex items-center gap-1" aria-hidden>
          {active.map((_, n) => <span key={n} className={cn("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-primary" : "w-1.5 bg-border")} />)}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-sm font-medium text-muted hover:text-fg">{last ? "" : "Skip tour"}</button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:border-primary/50">
                <ArrowLeft className="h-4 w-4" />Back
              </button>
            )}
            <button type="button" onClick={() => (last ? finish() : setI(i + 1))} className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-fg hover:opacity-90">
              {last ? "Done" : <>Next<ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "Take a tour" link/button: replays the tour on the current page. */
export function TourButton({ className, children = "Take a tour" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(START_EVENT))} className={cn("inline-flex items-center gap-1.5", className)}>
      <Compass className="h-4 w-4" />{children}
    </button>
  );
}
