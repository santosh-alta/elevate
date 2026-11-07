"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, Copy, Linkedin, MessageCircle, Twitter } from "lucide-react";
import { buttonClass } from "../ui/button";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live countdown to the event start; shows "Happening now" between start and end. */
export function Countdown({ startsAt, endsAt, tone = "light" }: { startsAt: string; endsAt: string; tone?: "light" | "dark" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const start = new Date(startsAt).getTime(), end = new Date(endsAt).getTime();
  if (now >= end) return null;
  if (now >= start) return <p className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />Happening now</p>;
  const p = parts(start - now);
  return (
    <div className="flex gap-2" aria-label="Time until the event starts">
      {([["d", "days"], ["h", "hrs"], ["m", "min"], ["s", "sec"]] as const).map(([k, l]) => (
        <div key={k} className={tone === "dark" ? "min-w-[60px] rounded-lg bg-hero-fg/10 px-2 py-1.5 text-center ring-1 ring-inset ring-hero-fg/20" : "min-w-[56px] rounded-lg bg-primary/10 px-2 py-1.5 text-center"}>
          <p className={`font-heading text-xl font-bold tabular-nums ${tone === "dark" ? "text-hero-fg" : "text-primary"}`}>{String(p[k]).padStart(2, "0")}</p>
          <p className={`text-[10px] uppercase tracking-wide ${tone === "dark" ? "text-hero-fg/80" : "text-muted"}`}>{l}</p>
        </div>
      ))}
    </div>
  );
}

/** Share to WhatsApp / LinkedIn / X and copy link. */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${title} — ${url}`;
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(text)}`, icon: <MessageCircle className="h-4 w-4" /> },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, icon: <Linkedin className="h-4 w-4" /> },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, icon: <Twitter className="h-4 w-4" /> },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")} aria-label={`Share on ${l.label}`}>
          {l.icon}<span className="hidden sm:inline">{l.label}</span>
        </a>
      ))}
      <button
        type="button" className={buttonClass("outline", "sm")}
        onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

/** "Add to calendar" menu: .ics download (Apple/Outlook) and Google Calendar. */
export function AddToCalendar({ icsUrl, googleUrl }: { icsUrl: string; googleUrl: string }) {
  return (
    <details className="relative">
      <summary className={buttonClass("outline", "sm", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
        <CalendarPlus className="h-4 w-4" />Add to calendar
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card text-sm shadow-lg">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="block px-3 py-2 hover:bg-bg">Google Calendar</a>
        <a href={icsUrl} className="block px-3 py-2 hover:bg-bg">Apple / Outlook (.ics)</a>
      </div>
    </details>
  );
}
