"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CalendarClock, CalendarDays, CalendarPlus, Check, Globe, Link2, MapPin, Share2, Trophy, Users, UsersRound, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** An outside hackathon as the calendar receives it. */
export type ExternalItem = {
  id: string; source: string; sourceLabel: string; title: string; organizer?: string | null; url: string;
  imageUrl?: string | null; coverUrl?: string | null; summary?: string | null; teamSize?: string | null;
  startsAt: string; endsAt: string; registrationEndsAt?: string | null; mode: string; location?: string | null;
  prize?: string | null; participants?: number | null; tags: string[]; major: boolean; kind?: string;
};

const OPEN = "ext-preview:open";
const TZ = "Asia/Kolkata";
const fmt = (d: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, ...o });

function daysLeft(d: string): { text: string; urgent: boolean } {
  const ms = new Date(d).getTime() - Date.now();
  if (ms < 0) return { text: "Closed", urgent: false };
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return { text: "Closes today", urgent: true };
  if (days === 1) return { text: "1 day left", urgent: true };
  return { text: `${days} days left`, urgent: days <= 3 };
}

/** Wraps a calendar chip or list row: opens the preview instead of leaving the site. */
export function ExternalTrigger({ id, className, title, children }: { id: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button type="button" title={title} className={cn("text-left", className)} onClick={() => window.dispatchEvent(new CustomEvent(OPEN, { detail: id }))}>
      {children}
    </button>
  );
}

/** The preview card: the essentials at a glance, then out to the organiser's page to register. One per page. */
export function ExternalPreview({ items, brand }: { items: ExternalItem[]; brand: string }) {
  const [item, setItem] = useState<ExternalItem | null>(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((id: string | null) => {
    const found = id ? items.find((i) => i.id === id) ?? null : null;
    setItem(found);
    setCopied(false);
    const url = new URL(window.location.href);
    if (found) url.searchParams.set("ext", found.id); else url.searchParams.delete("ext");
    window.history.replaceState(null, "", url);
  }, [items]);

  useEffect(() => {
    const onOpen = (e: Event) => open((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN, onOpen);
    // Shared link: /calendar?ext=<id> opens straight on that card.
    const fromUrl = new URLSearchParams(window.location.search).get("ext");
    if (fromUrl && items.some((i) => i.id === fromUrl)) setItem(items.find((i) => i.id === fromUrl)!);
    return () => window.removeEventListener(OPEN, onOpen);
  }, [items, open]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open(null);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [item, open]);

  if (!item) return null;
  const e = item;
  const deadline = e.registrationEndsAt ?? e.endsAt;
  const left = daysLeft(deadline);
  const sameDay = fmt(e.startsAt) === fmt(e.endsAt);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${e.title}${e.prize ? ` · ${e.prize}` : ""} · apply by ${fmt(deadline)}\n${shareUrl}`;
  const gstamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const gcal = e.kind === "CONTEST"
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${gstamp(new Date(e.startsAt))}/${gstamp(new Date(e.endsAt))}&details=${encodeURIComponent(`Join: ${e.url}`)}`
    : `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Deadline: ${e.title}`)}&dates=${gstamp(new Date(deadline))}/${gstamp(new Date(new Date(deadline).getTime() + 30 * 60_000))}&details=${encodeURIComponent(`Register: ${e.url}`)}`;

  const isContest = e.kind === "CONTEST";
  const minutes = Math.round((new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) / 60_000);
  const startTime = new Date(e.startsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const startsIn = daysLeft(e.startsAt);
  const contestStats: { icon: ReactNode; label: string; value: string; sub?: string; accent?: boolean }[] = [
    { icon: <CalendarDays className="h-4 w-4" />, label: "Date", value: fmt(e.startsAt, { weekday: "short", day: "numeric", month: "short" }), sub: startsIn.text === "Closed" ? "Started" : startsIn.text === "Closes today" ? "Today" : startsIn.text.replace("left", "to go"), accent: startsIn.urgent },
    { icon: <CalendarClock className="h-4 w-4" />, label: "Starts", value: startTime, sub: "India time" },
    { icon: <Users className="h-4 w-4" />, label: "Duration", value: minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m` },
    { icon: <Globe className="h-4 w-4" />, label: "Where", value: "Online", sub: "Free to join" },
    ...(e.tags.length ? [{ icon: <Trophy className="h-4 w-4" />, label: "Type", value: e.tags.join(" · ") }] : []),
  ];
  const stats: { icon: ReactNode; label: string; value: string; sub?: string; accent?: boolean }[] = isContest ? contestStats : [
    { icon: <Trophy className="h-4 w-4" />, label: "Prize pool", value: e.prize?.replace(/ in prizes$/, "") ?? "Certificates & goodies", accent: !!e.prize },
    { icon: <Users className="h-4 w-4" />, label: "Registered", value: e.participants ? e.participants.toLocaleString("en-IN") : "Open", sub: e.participants ? "students so far" : undefined },
    { icon: <CalendarClock className="h-4 w-4" />, label: e.registrationEndsAt ? "Apply by" : "Deadline", value: fmt(deadline), sub: left.text, accent: left.urgent },
    { icon: <CalendarDays className="h-4 w-4" />, label: "Dates", value: sameDay ? fmt(e.startsAt) : `${fmt(e.startsAt)} – ${fmt(e.endsAt)}` },
    { icon: e.mode === "ONLINE" ? <Globe className="h-4 w-4" /> : <MapPin className="h-4 w-4" />, label: "Where", value: e.mode === "ONLINE" ? "Online" : e.location ?? "In person", sub: e.mode === "HYBRID" ? "and online" : undefined },
    ...(e.teamSize ? [{ icon: <UsersRound className="h-4 w-4" />, label: "Team", value: e.teamSize }] : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={e.title}>
      <div className="absolute inset-0 bg-[rgb(10_12_30/0.6)] backdrop-blur-sm" onClick={() => open(null)} />
      <article className="animate-pop-in relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-card text-fg shadow-lift sm:rounded-3xl">
        {/* Banner */}
        <div className="relative h-36 shrink-0 overflow-hidden bg-hero-bg sm:h-44">
          {e.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.coverUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <>
              <div aria-hidden className="absolute -left-10 -top-16 h-56 w-56 rounded-full opacity-50 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
              <div aria-hidden className="absolute -bottom-20 right-0 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
              <div aria-hidden className="bg-grid absolute inset-0 opacity-60" />
              {e.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.imageUrl} alt="" aria-hidden referrerPolicy="no-referrer" className="absolute right-6 top-1/2 h-28 w-28 -translate-y-1/2 rotate-6 rounded-2xl object-cover opacity-25 blur-[1px]" />
              )}
            </>
          )}
          {e.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.imageUrl} alt="" referrerPolicy="no-referrer" className="absolute bottom-4 left-4 h-16 w-16 rounded-2xl border-2 border-white bg-white object-contain p-1 shadow-lift" />
          ) : <span className="absolute bottom-4 left-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white bg-amber-50 text-amber-600 shadow-lift"><Trophy className="h-7 w-7" /></span>}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" aria-hidden />
          <button ref={closeRef} type="button" onClick={() => open(null)} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"><X className="h-5 w-5" /></button>
          <span className="absolute left-4 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-900 shadow-soft">{isContest ? "Coding contest" : "External"} · {e.sourceLabel}</span>
        </div>

        <div className="overflow-y-auto px-5 pb-5 sm:px-6">
          <div className="mt-4 flex flex-wrap gap-1.5">
            {e.major && <span className="inline-flex items-center gap-1 rounded-full bg-highlight px-2.5 py-0.5 text-xs font-bold text-highlight-fg"><Trophy className="h-3 w-3" />Major</span>}
            {!isContest && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", left.urgent ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{left.text}</span>}
          </div>

          <h2 className="mt-2 font-heading text-2xl font-extrabold leading-tight tracking-tight">{e.title}</h2>
          {e.organizer && <p className="mt-1 text-sm text-muted">by {e.organizer}</p>}

          <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-bg p-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><span className="text-accent">{s.icon}</span>{s.label}</dt>
                <dd className={cn("mt-1 font-heading text-lg font-extrabold leading-tight", s.accent && "text-primary")}>{s.value}</dd>
                {s.sub && <dd className={cn("text-xs", s.label.startsWith("Apply") || s.label === "Deadline" ? (left.urgent ? "font-semibold text-red-600" : "text-emerald-700") : "text-muted")}>{s.sub}</dd>}
              </div>
            ))}
          </dl>

          {e.summary && <p className="mt-5 text-sm leading-relaxed text-fg/85">{e.summary}</p>}
          {e.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">{e.tags.map((t) => <span key={t} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg/80">{t}</span>)}</div>
          )}

          <p className="mt-5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-fg/80">
            {isContest
              ? <>Runs on {e.sourceLabel}, not by {brand}. Regular contests are great practice for placements and build your rating on the coding profile you added to {brand}.</>
              : <>Organised by {e.organizer ?? "another organiser"} on {e.sourceLabel}, not by {brand}. We list it so you don&apos;t miss it; check the rules and dates on their page before you register.</>}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-fg shadow-soft transition hover:opacity-90">
            {isContest ? `Open on ${e.sourceLabel}` : <>View &amp; register on {e.sourceLabel}</>}<ArrowUpRight className="h-4 w-4" />
          </a>
          <div className="flex justify-center gap-2">
            <a href={gcal} target="_blank" rel="noopener noreferrer" title="Add the deadline to Google Calendar" aria-label="Add the deadline to Google Calendar" className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:border-primary/50"><CalendarPlus className="h-5 w-5" /></a>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" title="Share on WhatsApp" aria-label="Share on WhatsApp" className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:border-primary/50"><Share2 className="h-5 w-5" /></a>
            <button type="button" title="Copy link" aria-label="Copy link" onClick={() => { void navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true)); }} className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:border-primary/50">
              {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Link2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </article>
    </div>,
    document.body,
  );
}
