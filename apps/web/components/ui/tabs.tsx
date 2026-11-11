import Link from "next/link";
import { cn } from "./cn";

/** URL-driven tabs (?tab=key) so every tab is linkable and server-rendered. Segmented pill style. */
export function Tabs({ tabs, active, baseHref }: { tabs: { key: string; label: string }[]; active: string; baseHref: string }) {
  return (
    <nav className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-max gap-1 rounded-full border border-border/80 bg-card p-1 shadow-soft">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${baseHref}?tab=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
              active === t.key ? "bg-hero-bg text-hero-fg shadow-soft" : "text-muted hover:bg-primary/5 hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
