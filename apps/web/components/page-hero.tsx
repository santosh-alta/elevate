import type { ReactNode } from "react";
import { cn } from "./ui/cn";

/** Brand hero band at the top of public pages: drifting brand glows, a faint grid, and a gentle fade-in. */
export function PageHero({
  eyebrow, title, description, children, className, size = "md",
}: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; size?: "sm" | "md" }) {
  return (
    <section className={cn("relative isolate overflow-hidden bg-hero-bg text-hero-fg", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-20 -top-28 h-80 w-80 animate-aurora rounded-full opacity-40 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
        <div className="absolute -bottom-32 left-1/4 h-72 w-72 animate-aurora-slow rounded-full opacity-25 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
        <div className="bg-grid absolute inset-0" />
      </div>
      <div className={cn("mx-auto max-w-6xl px-4", size === "sm" ? "py-10 sm:py-12" : "py-12 sm:py-16")}>
        {eyebrow && (typeof eyebrow === "string" ? (
          <div className="glass mb-4 inline-flex animate-fade-up items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-hero-fg/90">
            <span className="h-1.5 w-1.5 rounded-full bg-hero-accent" aria-hidden />{eyebrow}
          </div>
        ) : (
          <div className="mb-4 animate-fade-up text-sm text-hero-fg/85">{eyebrow}</div>
        ))}
        <h1 className={cn("animate-fade-up font-heading font-extrabold tracking-tight [animation-delay:60ms]", size === "sm" ? "text-3xl sm:text-4xl" : "text-4xl sm:text-6xl")}>{title}</h1>
        <div className="mt-4 h-1.5 w-16 animate-fade-up rounded-full bg-brand-gradient [animation-delay:120ms]" aria-hidden />
        {description && <p className="mt-4 max-w-2xl animate-fade-up text-base text-hero-fg/85 [animation-delay:160ms] sm:text-lg">{description}</p>}
        {children}
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" />
    </section>
  );
}
