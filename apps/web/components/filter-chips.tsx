import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./ui/cn";

/** Build a URL from the current query with some keys changed (undefined/"" removes a key). */
export function hrefWith(path: string, current: Record<string, string | undefined>, changes: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** Link styled as a filter chip; `active` marks the current choice (aria-current). */
export function FilterChip({ href, active, children, className }: { href: string; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-soft transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        active ? "border-transparent bg-hero-bg text-hero-fg shadow-lift" : "border-border bg-card text-fg hover:-translate-y-px hover:border-accent/60 hover:text-primary",
        className,
      )}
    >
      {children}
    </Link>
  );
}
