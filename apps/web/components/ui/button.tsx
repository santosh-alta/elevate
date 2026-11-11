import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * primary: brand primary (default) · cta: brand secondary colour for the main call to action (Register, Apply)
 * secondary: soft primary tint · outline / ghost / danger.
 */
export type ButtonVariant = "primary" | "cta" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-brand font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card whitespace-nowrap",
    size === "sm" && "h-8 px-3 text-sm",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-base",
    variant === "primary" && "btn-sheen bg-primary text-primary-fg shadow-soft hover:-translate-y-px hover:bg-primary/90 hover:shadow-lift",
    variant === "cta" && "btn-sheen bg-secondary text-secondary-fg font-semibold shadow-soft hover:-translate-y-px hover:shadow-glow hover:brightness-105",
    variant === "secondary" && "bg-primary/10 text-primary hover:bg-primary/15",
    variant === "outline" && "border border-border bg-card text-fg shadow-soft hover:border-fg/20 hover:bg-bg",
    variant === "ghost" && "text-fg hover:bg-fg/5",
    variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
    extra,
  );
}

export function Button({
  variant, size, className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href, variant, size, className, children, external,
}: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode; external?: boolean }) {
  if (external) {
    return <a href={href} target="_blank" rel="noreferrer" className={buttonClass(variant, size, className)}>{children}</a>;
  }
  return <Link href={href} className={buttonClass(variant, size, className)}>{children}</Link>;
}
