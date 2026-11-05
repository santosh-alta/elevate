import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-brand font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 whitespace-nowrap",
    size === "sm" && "h-8 px-3 text-sm",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-base",
    variant === "primary" && "bg-primary text-primary-fg hover:bg-primary/90",
    variant === "secondary" && "bg-primary/10 text-primary hover:bg-primary/15",
    variant === "outline" && "border border-border bg-card text-fg hover:bg-bg",
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
