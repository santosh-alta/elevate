"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, LogOut, Ticket, UserRound } from "lucide-react";
import { Avatar } from "../avatar";

/** Avatar button with the signed-in person's menu: my events, profile, admin, sign out. */
export function AccountMenu({ name, email, avatarUrl, roleLabel, showAdmin }: {
  name: string; email: string; avatarUrl?: string | null; roleLabel?: string | null; showAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-primary/5 focus:outline-none focus-visible:bg-primary/5";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className={`rounded-full transition duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${open ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-card" : ""}`}
      >
        <Avatar name={name} url={avatarUrl} size={34} />
      </button>
      {open && (
        <div role="menu" className="animate-pop-in absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-brand border border-border bg-card p-1.5 shadow-lg">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={name} url={avatarUrl} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted">{email}</p>
              {roleLabel && <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">{roleLabel}</p>}
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link role="menuitem" href="/me" className={item} onClick={() => setOpen(false)}><Ticket className="h-4 w-4 text-muted" />My events &amp; certificates</Link>
          <Link role="menuitem" href="/profile?next=/me" className={item} onClick={() => setOpen(false)}><UserRound className="h-4 w-4 text-muted" />Edit profile</Link>
          {showAdmin && <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}><LayoutDashboard className="h-4 w-4 text-muted" />Admin</Link>}
          <div className="my-1 h-px bg-border" />
          <form action="/api/auth/logout" method="post">
            <button role="menuitem" type="submit" className={`${item} text-red-600`}><LogOut className="h-4 w-4" />Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
