import type { ReactNode } from "react";
import { cn } from "./cn";

export function Stat({ label, value, hint, icon, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("card-glow group rounded-brand border border-border/80 bg-card p-4 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-lift", className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {icon && <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-hero-bg text-hero-accent transition group-hover:scale-110 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      </div>
      <div className="mt-2 font-heading text-3xl font-bold tabular-nums text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-fg/10", className)}>
      <div className="h-full rounded-full bg-brand-gradient transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}
