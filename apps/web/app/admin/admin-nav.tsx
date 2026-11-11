"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarPlus, CalendarRange, ClipboardCheck, ListChecks, LayoutDashboard, MessageSquareHeart, Settings, UsersRound } from "lucide-react";
import { cn } from "@/components/ui/cn";

type Who = { staff: boolean; reviewer: boolean; admin: boolean };
const ITEMS: { href: string; label: string; organizerLabel?: string; icon: typeof CalendarDays; exact?: boolean; show: (w: Who) => boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, show: (w) => w.staff },
  { href: "/admin/review", label: "Review queue", icon: ClipboardCheck, show: (w) => w.reviewer },
  { href: "/admin/tasks", label: "My tasks", icon: ListChecks, show: (w) => w.staff },
  { href: "/admin/events", label: "Events", organizerLabel: "My events", icon: CalendarRange, show: () => true },
  { href: "/admin/events/new", label: "Create event", icon: CalendarPlus, exact: true, show: () => true },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, show: (w) => w.staff },
  { href: "/admin/guests", label: "Guest library", icon: UsersRound, show: (w) => w.staff },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareHeart, show: (w) => w.staff },
  { href: "/admin/settings", label: "Brand settings", icon: Settings, show: (w) => w.staff },
];

export function AdminNav(who: Who) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
      {ITEMS.filter((i) => i.show(who)).map(({ href, label: staffLabel, organizerLabel, icon: Icon, exact }) => {
        const label = !who.staff && organizerLabel ? organizerLabel : staffLabel;
        const active = exact ? path === href : path.startsWith(href) && !(href === "/admin/events" && path === "/admin/events/new");
        return (
          <Link
            key={href}
            aria-current={active ? "page" : undefined}
            href={href}
            className={cn(
              "group relative flex items-center gap-3 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active ? "glass text-hero-fg shadow-soft" : "text-hero-fg/80 hover:bg-hero-fg/[0.06] hover:text-hero-fg",
            )}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-brand-gradient lg:-left-0" aria-hidden />}
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition", active ? "bg-hero-accent/15 text-hero-accent" : "bg-hero-fg/[0.06] group-hover:bg-hero-fg/10")}>
              <Icon className="h-4 w-4" />
            </span>{label}
          </Link>
        );
      })}
    </nav>
  );
}
