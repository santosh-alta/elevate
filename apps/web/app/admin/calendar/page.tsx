import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { apiList } from "@/lib/api";
import { EVENT_TYPE_GROUPS, eventLabel, typeColor } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Card, LinkButton, buttonClass } from "@/components/ui";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Calendar" };

const TZ = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const today = new Date();
  const [y, m] = (month && /^\d{4}-\d{2}$/.test(month) ? month : dayKey(today).slice(0, 7)).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7; // Monday-first
  const gridStart = new Date(first.getTime() - offset * 864e5);
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 864e5));
  const from = new Date(gridStart.getTime() - 864e5).toISOString();
  const to = new Date(days[41].getTime() + 864e5).toISOString();

  let events = await apiList<ElevateEvent>(`/events/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!events.length) {
    events = (await apiList<ElevateEvent>("/events?limit=500")).filter((e) => e.endsAt >= from && e.startsAt <= to);
  }
  const byDay = new Map<string, ElevateEvent[]>();
  for (const e of events) {
    const start = new Date(e.startsAt), end = new Date(e.endsAt);
    for (let t = start.getTime(), n = 0; t <= end.getTime() + 1 && n < 31; t += 864e5, n++) {
      const k = dayKey(new Date(t));
      byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
    const endKey = dayKey(end);
    if (!byDay.get(endKey)?.includes(e)) byDay.set(endKey, [...(byDay.get(endKey) ?? []), e]);
  }
  const shift = (d: number) => {
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const label = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const todayKey = dayKey(today);
  const monthCount = events.filter((e) => dayKey(new Date(e.startsAt)).startsWith(`${y}-${String(m).padStart(2, "0")}`)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted">{monthCount} event{monthCount === 1 ? "" : "s"} starting in {label}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/calendar?month=${shift(-1)}`} className={buttonClass("outline", "sm")} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[140px] text-center font-medium">{label}</span>
          <Link href={`/admin/calendar?month=${shift(1)}`} className={buttonClass("outline", "sm")} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
          <Link href="/admin/calendar" className={buttonClass("ghost", "sm")}>Today</Link>
          <LinkButton href="/admin/events/new" size="sm"><Plus className="h-4 w-4" />New event</LinkButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {EVENT_TYPE_GROUPS.map((g) => <span key={g.label} className={cn("rounded-full border px-2 py-0.5", typeColor(g.types[0]))}>{g.label}</span>)}
      </div>

      <Card className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7">
          {WEEKDAYS.map((w) => <div key={w} className="border-b border-border bg-bg px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{w}</div>)}
          {days.map((d) => {
            const k = dayKey(d);
            const inMonth = d.getUTCMonth() === m - 1;
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} className={cn("min-h-[112px] border-b border-r border-border p-1.5", !inMonth && "bg-bg/60")}>
                <p className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", k === todayKey ? "bg-primary font-semibold text-primary-fg" : inMonth ? "text-fg" : "text-muted")}>{d.getUTCDate()}</p>
                <ul className="space-y-1">
                  {list.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/admin/events/${e.id}`}
                        title={`${e.title} · ${eventLabel(e)} · ${e.status}`}
                        className={cn("block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium hover:brightness-95", typeColor(e.type), e.status === "CANCELLED" && "line-through opacity-60")}
                      >
                        {dayKey(new Date(e.startsAt)) === k && <span className="mr-1 tabular-nums">{new Date(e.startsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ })}</span>}
                        {e.title}
                      </Link>
                    </li>
                  ))}
                  {list.length > 3 && <li className="px-1 text-[11px] text-muted">+{list.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
