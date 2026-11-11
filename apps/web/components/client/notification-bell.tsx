"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import { callApi } from "./api";

type Item = { id: string; subject: string; body?: string; createdAt: string; readAt?: string | null; ctaUrl?: string | null; ctaLabel?: string | null };

function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Same-site links open in place; others in a new tab. */
function localPath(url: string): string | null {
  try { const u = new URL(url, location.href); return u.origin === location.origin || u.hostname.endsWith(location.hostname) ? u.pathname + u.search + u.hash : null; }
  catch { return null; }
}

/** Bell with a dropdown panel: read, mark read, clear, open, without leaving the page. */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const list = await callApi<Item[]>("GET", "/me/notifications?limit=40");
      setItems(list);
      setUnread(list.filter((n) => !n.readAt).length);
    } catch { setItems([]); }
  }

  useEffect(() => { if (open) void load(); }, [open]);
  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function markRead(ids?: string[]) {
    const now = new Date().toISOString();
    setItems((xs) => xs?.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)) ?? xs);
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    await callApi("POST", "/me/notifications/read", ids ? { ids } : {}).catch(() => {});
    router.refresh();
  }
  async function remove(id: string) {
    const n = items?.find((x) => x.id === id);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? xs);
    if (n && !n.readAt) setUnread((u) => Math.max(0, u - 1));
    await callApi("DELETE", `/me/notifications/${id}`).catch(() => {});
    router.refresh();
  }
  async function clearRead() {
    setBusy(true);
    setItems((xs) => xs?.filter((x) => !x.readAt) ?? xs);
    await callApi("DELETE", "/me/notifications").catch(() => {});
    setBusy(false);
    router.refresh();
  }
  function openItem(n: Item) {
    if (!n.readAt) void markRead([n.id]);
    if (!n.ctaUrl) return;
    const path = localPath(n.ctaUrl);
    setOpen(false);
    if (path) router.push(path); else window.open(n.ctaUrl, "_blank", "noopener");
  }

  const hasRead = !!items?.some((n) => n.readAt);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${open ? "bg-primary/10 text-fg" : "text-fg/80 hover:bg-primary/5 hover:text-fg"}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="animate-pop-in fixed inset-x-3 top-16 z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-brand border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[400px]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-semibold">Notifications{unread > 0 && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{unread} new</span>}</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={() => markRead()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5">
                  <CheckCheck className="h-3.5 w-3.5" />Mark all read
                </button>
              )}
              {hasRead && (
                <button type="button" disabled={busy} onClick={clearRead} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-primary/5 hover:text-fg">
                  <Trash2 className="h-3.5 w-3.5" />Clear read
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {items === null ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-primary/5" />)}</div>
            ) : items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted/50" />
                <p className="mt-2 font-medium">You’re all caught up</p>
                <p className="text-sm text-muted">New updates about your events will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id} className={`group relative flex gap-3 px-4 py-3 transition ${n.readAt ? "" : "bg-primary/[0.04]"} ${n.ctaUrl ? "cursor-pointer hover:bg-primary/5" : ""}`} onClick={() => openItem(n)}>
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.readAt ? "text-fg/80" : "font-semibold"}`}>{n.subject}</p>
                      {n.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-muted">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted">{ago(n.createdAt)}{n.ctaLabel && n.ctaUrl ? <> · <span className="font-medium text-primary">{n.ctaLabel} →</span></> : null}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      {!n.readAt && (
                        <button type="button" title="Mark read" aria-label="Mark read" onClick={(e) => { e.stopPropagation(); void markRead([n.id]); }} className="rounded p-1 text-muted hover:bg-primary/10 hover:text-fg">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" title="Clear" aria-label="Clear" onClick={(e) => { e.stopPropagation(); void remove(n.id); }} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link href="/me#notifications" onClick={() => setOpen(false)} className="border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-primary/5">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
