"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Scroll reveal: sections and cards marked with data-reveal (plus every <main> section) rise into view.
 * Items that share a parent are staggered. Re-runs on every page.
 */
export function ScrollReveal() {
  const pathname = usePathname();
  useEffect(() => {
    const SELECTOR = "main section, main [data-reveal]";
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }),
      // Start revealing ~300px before an item scrolls into view, so it is already there when you reach it.
      { rootMargin: "0px 0px 300px 0px", threshold: 0 },
    );
    const seen = new WeakSet<Element>();
    /** Prepares new reveal targets: on screen (or just below) → shown at once; further down → revealed on scroll. */
    const prepare = (els: HTMLElement[]) => {
      const fresh = els.filter((el) => !seen.has(el));
      const siblings = new Map<Element, number>();
      for (const el of fresh) {
        seen.add(el);
        el.setAttribute("data-reveal", "");
        const parent = el.parentElement;
        if (parent) {
          const i = siblings.get(parent) ?? 0;
          siblings.set(parent, i + 1);
          if (i > 0) el.style.setProperty("--reveal-delay", `${Math.min(i, 3) * 40}ms`);
        }
        if (el.getBoundingClientRect().top < window.innerHeight * 1.25) el.classList.add("is-visible");
        else io.observe(el);
      }
    };
    prepare(Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)));
    document.documentElement.classList.add("js-reveal");
    // Content that arrives later (streamed pages, client updates) is picked up too, so nothing stays hidden.
    const mo = new MutationObserver((records) => {
      const added: HTMLElement[] = [];
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches(SELECTOR)) added.push(n);
          added.push(...Array.from(n.querySelectorAll<HTMLElement>(SELECTOR)));
        });
      }
      if (added.length) prepare(added);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [pathname]);
  return null;
}

/** Thin brand-gradient bar across the top while the next page loads. */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setVisible(true); setWidth(12);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.1 : w)), 200);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setWidth(100);
    const t = setTimeout(() => { setVisible(false); setWidth(0); }, 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]">
      <div className="nav-progress h-full bg-brand-gradient shadow-[0_0_10px_rgb(var(--gradient-to)/0.6)]" style={{ width: `${width}%`, opacity: visible ? 1 : 0 }} />
    </div>
  );
}

/** Marks the page as scrolled (header shadow) and shows a back-to-top button further down. */
export function ScrollEffects() {
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      document.documentElement.dataset.scrolled = y > 8 ? "true" : "false";
      setShowTop(y > 700);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden ${showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
