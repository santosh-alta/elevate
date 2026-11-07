"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../ui/cn";

/** Sticky in-page navigation with scroll-spy. `items` are [id, label] of sections rendered on the page. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((x): x is HTMLElement => !!x);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

  // Keep the active pill in view on small screens.
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (el && bar.current) bar.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
  }, [active]);

  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="sticky top-16 z-20 -mx-4 mt-6 border-b border-border bg-bg/90 px-4 backdrop-blur">
      <div ref={bar} className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <a
            key={i.id} href={`#${i.id}`} data-id={i.id}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
              active === i.id ? "bg-primary text-primary-fg" : "text-muted hover:bg-fg/5 hover:text-fg",
            )}
          >
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
