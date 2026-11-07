"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarPlus, CalendarRange, LayoutDashboard, Settings, UsersRound } from "lucide-react";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/events", label: "Events", icon: CalendarRange },
  { href: "/admin/events/new", label: "Create event", icon: CalendarPlus, exact: true },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/guests", label: "Guest library", icon: UsersRound },
  { href: "/admin/settings", label: "Brand settings", icon: Settings },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href) && !(href === "/admin/events" && path === "/admin/events/new");
        return (
          <Link
            key={href}
            aria-current={active ? "page" : undefined}
            href={href}
            className={cn(
              "relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active ? "bg-hero-fg/10 text-hero-fg" : "text-hero-fg/80 hover:bg-hero-fg/5 hover:text-hero-fg",
            )}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-brand-gradient lg:-left-0" aria-hidden />}
            <Icon className={cn("h-4 w-4", active && "text-hero-accent")} />{label}
          </Link>
        );
      })}
    </nav>
  );
}
