import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple" | "primary" | "teal" | "highlight" | "secondary";

const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  primary: "bg-primary/10 text-primary ring-primary/20",
  /** Brand highlight (e.g. Alta yellow): use sparingly, for "new", "featured", ribbons */
  highlight: "bg-highlight text-highlight-fg ring-highlight",
  secondary: "bg-secondary/15 text-fg ring-secondary/40",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "gray",
  PLANNING: "purple",
  ANNOUNCED: "blue",
  REGISTRATION_OPEN: "green",
  REGISTRATION_CLOSED: "amber",
  LIVE: "red",
  JUDGING: "purple",
  COMPLETED: "teal",
  ARCHIVED: "gray",
  CANCELLED: "red",
  // generic statuses
  TODO: "gray", IN_PROGRESS: "blue", DONE: "green", BLOCKED: "red", SKIPPED: "gray",
  REGISTERED: "blue", APPROVED: "green", WAITLISTED: "amber", REJECTED: "red", CHECKED_IN: "teal", NO_SHOW: "gray",
  PROPOSED: "gray", INVITED: "blue", CONFIRMED: "green", DECLINED: "red", ARRIVED: "teal", THANKED: "purple",
  PLANNED: "gray", DRAFTED: "amber", POSTED: "green", SUGGESTED: "blue", EDITED: "amber",
  PENDING: "amber", SENT: "green", FAILED: "red", PENDING_PAYMENT: "amber",
};

const LABELS: Record<string, string> = { PENDING_PAYMENT: "Payment pending", LIVE: "● Live", REGISTRATION_OPEN: "Registration open", REGISTRATION_CLOSED: "Registration closed" };

export function StatusBadge({ status }: { status: string }) {
  const label = LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{label}</Badge>;
}
