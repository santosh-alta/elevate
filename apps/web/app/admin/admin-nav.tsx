"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, CalendarRange, LayoutDashboard, Settings } from "lucide-react";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/events", label: "Events", icon: CalendarRange },
  { href: "/admin/events/new", label: "Create event", icon: CalendarPlus, exact: true },
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
            href={href}
            className={cn(
              "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted hover:bg-fg/5 hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
