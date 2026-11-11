"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CalendarRange, Menu, MapPin, Trophy, X } from "lucide-react";

type Item = { href: string; label: string; icon: typeof Menu };

/** Main site links: underline slides in on hover and marks the current page; a sliding menu on phones. */
export function SiteNav({ showCampuses }: { showCampuses: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items: Item[] = [
    { href: "/events", label: "Events", icon: CalendarRange },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ...(showCampuses ? [{ href: "/campuses", label: "Campuses", icon: MapPin }] : []),
    { href: "/winners", label: "Winners", icon: Trophy },
  ];
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <ul className="hidden items-center gap-1 sm:flex">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active(i.href) ? "page" : undefined}
              className={`group relative inline-flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${active(i.href) ? "text-fg" : "text-fg/70 hover:text-fg"}`}
            >
              {i.label}
              <span
                aria-hidden
                className={`absolute inset-x-3 -bottom-0.5 h-0.5 origin-left rounded-full bg-brand-gradient transition-transform duration-300 ${active(i.href) ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`}
              />
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-full text-fg/80 transition hover:bg-primary/5 hover:text-fg sm:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          <div aria-hidden className="fixed inset-0 top-16 z-30 bg-fg/20 backdrop-blur-[2px] sm:hidden" onClick={() => setOpen(false)} />
          <nav aria-label="Menu" className="animate-pop-in fixed inset-x-3 top-[4.25rem] z-40 rounded-brand border border-border bg-card p-2 shadow-lift sm:hidden">
            {items.map((i, n) => {
              const Icon = i.icon;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  style={{ animationDelay: `${n * 40}ms` }}
                  className={`animate-fade-up flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition ${active(i.href) ? "bg-primary/5 text-fg" : "text-fg/80 hover:bg-primary/5"}`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hero-bg text-hero-accent"><Icon className="h-4 w-4" /></span>
                  {i.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </>
  );
}
