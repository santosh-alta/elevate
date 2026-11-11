import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="bg-dots flex flex-col items-center justify-center rounded-brand border border-dashed border-border px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 animate-float items-center justify-center rounded-2xl bg-hero-bg text-hero-accent shadow-soft [&_svg]:h-6 [&_svg]:w-6">
        {icon ?? <Sparkles />}
      </span>
      <p className="font-heading text-lg font-bold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
