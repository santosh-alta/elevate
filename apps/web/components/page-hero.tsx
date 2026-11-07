import type { ReactNode } from "react";
import { cn } from "./ui/cn";

/** Brand hero band (theme heroBg / heroFg + gradient accent) used at the top of public pages. */
export function PageHero({
  eyebrow, title, description, children, className, size = "md",
}: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; size?: "sm" | "md" }) {
  return (
    <section className={cn("relative isolate overflow-hidden bg-hero-bg text-hero-fg", className)}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: "radial-gradient(50% 90% at 100% 0%, rgb(var(--gradient-from) / 0.3), transparent 60%), radial-gradient(40% 80% at 0% 100%, rgb(var(--gradient-to) / 0.18), transparent 60%)" }}
      />
      <div className={cn("mx-auto max-w-6xl px-4", size === "sm" ? "py-8 sm:py-10" : "py-10 sm:py-14")}>
        {eyebrow && <div className="mb-3 text-sm text-hero-fg/85">{eyebrow}</div>}
        <h1 className={cn("font-heading font-extrabold tracking-tight", size === "sm" ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl")}>{title}</h1>
        <div className="mt-4 h-1.5 w-16 rounded-full bg-brand-gradient" aria-hidden />
        {description && <p className="mt-4 max-w-2xl text-base text-hero-fg/85 sm:text-lg">{description}</p>}
        {children}
      </div>
    </section>
  );
}
