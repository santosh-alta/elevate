import Link from "next/link";
import { cn } from "./cn";

/** URL-driven tabs (?tab=key) so every tab is linkable and server-rendered. */
export function Tabs({ tabs, active, baseHref }: { tabs: { key: string; label: string }[]; active: string; baseHref: string }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${baseHref}?tab=${t.key}`}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
