import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Globe, MapPin, Trophy, Users } from "lucide-react";
import { apiPublic } from "@/lib/api";
import { getOrigin, getTenant, requireTenant } from "@/lib/tenant";
import { sharePreview } from "@/lib/brand-meta";
import { eventLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { FilterChip, hrefWith } from "@/components/filter-chips";
import { cn } from "@/components/ui/cn";

export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getOrigin()]);
  const short = tenant?.name.split(" ")[0] ?? "";
  return { title: "Calendar", ...sharePreview(tenant, origin, "events", `Event calendar · ${short}`, `${short} events and major hackathons students can join, by date.`, "/calendar") };
}

type OwnEvent = Pick<ElevateEvent, "id" | "slug" | "title" | "type" | "startsAt" | "endsAt" | "mode" | "status" | "venue" | "category"> & {
  campuses?: { campus: { name: string; city?: string | null } }[];
};
type External = {
  id: string; source: string; sourceLabel: string; title: string; organizer?: string | null; url: string; imageUrl?: string | null;
  startsAt: string; endsAt: string; registrationEndsAt?: string | null; mode: string; location?: string | null;
  prize?: string | null; participants?: number | null; tags: string[]; major: boolean;
};
type Entry =
  | { kind: "own"; e: OwnEvent; note?: string }
  | { kind: "ext"; e: External; note: string };

const TZ = "Asia/Kolkata";
const dayKey = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const time = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const short = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; show?: string }> }) {
  const tenant = await requireTenant();
  const brand = tenant.name.split(" ")[0];
  const sp = await searchParams;
  const show = sp.show === "ours" || sp.show === "external" ? sp.show : undefined;
  const today = new Date();
  const [y, m] = (sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : dayKey(today).slice(0, 7)).split("-").map(Number);
  const monthPrefix = `${y}-${String(m).padStart(2, "0")}`;
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first.getTime() - offset * 864e5);
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 864e5));
  const from = new Date(gridStart.getTime() - 864e5).toISOString();
  const to = new Date(days[41].getTime() + 864e5).toISOString();

  const data = (await apiPublic<{ events: OwnEvent[]; external: External[] }>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, 300)) ?? { events: [], external: [] };
  const own = show === "external" ? [] : data.events;
  const ext = show === "ours" ? [] : data.external;

  // Our events fill every day they run. Outside ones mark only their key dates (start, and the deadline),
  // because many run for weeks and would cover the whole month.
  const byDay = new Map<string, Entry[]>();
  const add = (k: string, entry: Entry) => byDay.set(k, [...(byDay.get(k) ?? []), entry]);
  for (const e of own) {
    const s = new Date(e.startsAt).getTime(), end = new Date(e.endsAt).getTime();
    const keys = new Set<string>();
    for (let t = s, n = 0; t <= end && n < 40; t += 864e5, n++) keys.add(dayKey(new Date(t)));
    keys.add(dayKey(e.endsAt));
    for (const k of keys) add(k, { kind: "own", e });
  }
  for (const e of ext) {
    const startK = dayKey(e.startsAt);
    const deadline = e.registrationEndsAt ?? e.endsAt;
    const deadK = dayKey(deadline);
    if (new Date(e.startsAt) >= today || startK === deadK) add(startK, { kind: "ext", e, note: startK === deadK ? "Deadline" : "Starts" });
    if (deadK !== startK) add(deadK, { kind: "ext", e, note: e.registrationEndsAt ? "Apply by" : "Ends" });
  }
  for (const list of byDay.values()) list.sort((a, b) => (a.kind === b.kind ? (a.kind === "ext" && b.kind === "ext" ? Number(b.e.major) - Number(a.e.major) : 0) : a.kind === "own" ? -1 : 1));

  const shift = (d: number) => {
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const label = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const todayKey = dayKey(today);
  const current = { month: sp.month, show };
  const agenda = [...byDay.entries()].filter(([k]) => k.startsWith(monthPrefix) && k >= (monthPrefix === todayKey.slice(0, 7) ? todayKey : "")).sort(([a], [b]) => a.localeCompare(b));
  const ownCount = new Set(data.events.filter((e) => dayKey(e.startsAt).startsWith(monthPrefix) || dayKey(e.endsAt).startsWith(monthPrefix)).map((e) => e.id)).size;
  const extCount = data.external.length;

  return (
    <>
      <PageHero eyebrow="Calendar" title="What's on" description={`${brand} events, plus major hackathons and competitions on other platforms that students can join.`} className="pb-10" />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="relative -mt-10 flex animate-fade-up flex-wrap items-center justify-between gap-3 rounded-brand border border-border/70 bg-card p-4 shadow-lift">
          <div className="flex items-center gap-2">
            <Link href={hrefWith("/calendar", current, { month: shift(-1) })} scroll={false} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/50"><ChevronLeft className="h-4 w-4" /></Link>
            <h2 className="min-w-[150px] text-center font-heading text-lg font-bold">{label}</h2>
            <Link href={hrefWith("/calendar", current, { month: shift(1) })} scroll={false} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/50"><ChevronRight className="h-4 w-4" /></Link>
            {monthPrefix !== todayKey.slice(0, 7) && <Link href={hrefWith("/calendar", current, { month: undefined })} scroll={false} className="ml-1 text-sm font-medium text-primary hover:underline">Today</Link>}
          </div>
          <div className="flex flex-wrap gap-2" data-tour="calendar-filter">
            <FilterChip href={hrefWith("/calendar", current, { show: undefined })} active={!show}>All</FilterChip>
            <FilterChip href={hrefWith("/calendar", current, { show: "ours" })} active={show === "ours"}><span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />{brand} events · {ownCount}</FilterChip>
            <FilterChip href={hrefWith("/calendar", current, { show: "external" })} active={show === "external"}><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-amber-500" aria-hidden />Outside hackathons · {extCount}</FilterChip>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-primary" aria-hidden />{brand} event: register here</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-amber-500 bg-amber-50" aria-hidden />External: run by another organiser, register on their site <ArrowUpRight className="h-3 w-3" /></span>
          <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-amber-500" />Major: big prizes or thousands taking part</span>
        </div>

        {/* Month grid (tablets and up) */}
        <div className="mt-5 hidden overflow-hidden rounded-brand border border-border bg-card shadow-soft md:block" data-tour="calendar-grid">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w) => <div key={w} className="border-b border-border bg-bg px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{w}</div>)}
            {days.map((d) => {
              const k = dayKey(d);
              const inMonth = d.getUTCMonth() === m - 1;
              const list = byDay.get(k) ?? [];
              return (
                <div key={k} className={cn("min-h-[118px] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-bg/60", k < todayKey && "opacity-70")}>
                  <p className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", k === todayKey ? "bg-primary font-semibold text-primary-fg" : inMonth ? "text-fg" : "text-muted")}>{d.getUTCDate()}</p>
                  <ul className="space-y-1">
                    {list.slice(0, 3).map((x) => (
                      <li key={`${x.kind}-${x.e.id}`}>
                        {x.kind === "own" ? (
                          <Link href={`/events/${x.e.slug}`} title={`${x.e.title} · ${eventLabel(x.e)}`} className="block truncate rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-fg hover:opacity-90">
                            {dayKey(x.e.startsAt) === k && <span className="mr-1 font-normal opacity-80">{time(x.e.startsAt)}</span>}{x.e.title}
                          </Link>
                        ) : (
                          <a href={x.e.url} target="_blank" rel="noopener noreferrer nofollow" title={`External · ${x.e.sourceLabel} · ${x.note}: ${x.e.title}`} className="flex items-center gap-1 truncate rounded-md border border-dashed border-amber-500/70 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-200">
                            {x.e.major && <Trophy className="h-3 w-3 shrink-0 text-amber-500" />}
                            <span className="shrink-0 opacity-75">{x.note}:</span><span className="truncate">{x.e.title}</span>
                          </a>
                        )}
                      </li>
                    ))}
                    {list.length > 3 && <li className="px-1 text-[11px] text-muted">+{list.length - 3} more below</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agenda: the whole month by date (the main view on phones) */}
        <section className="mt-10" data-tour="calendar-agenda">
          <h2 className="font-heading text-2xl font-bold tracking-tight">{monthPrefix === todayKey.slice(0, 7) ? "Coming up this month" : label}</h2>
          {!agenda.length && (
            <div className="mt-4 rounded-brand border border-dashed border-border p-10 text-center text-sm text-muted">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-accent" />Nothing on these dates yet. Try the next month.
            </div>
          )}
          <ol className="mt-4 space-y-6">
            {agenda.map(([k, list]) => (
              <li key={k} className="grid gap-3 sm:grid-cols-[110px_1fr]">
                <div className="sm:pt-3">
                  <p className={cn("font-heading text-lg font-bold", k === todayKey && "text-primary")}>{new Date(`${k}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</p>
                  <p className="text-xs uppercase tracking-wide text-muted">{k === todayKey ? "Today" : new Date(`${k}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}</p>
                </div>
                <ul className="space-y-2.5">
                  {list.map((x) => <li key={`${x.kind}-${x.e.id}`}>{x.kind === "own" ? <OwnRow e={x.e} brand={brand} day={k} /> : <ExtRow e={x.e} note={x.note} />}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-10 rounded-xl bg-bg px-4 py-3 text-xs text-muted">
          External events are organised by others and listed so students don&apos;t miss good opportunities. Dates, prizes and rules can change, so check the organiser&apos;s page before registering. Listings come from Unstop, Devfolio, MLH and Devpost, and are refreshed daily.
        </p>
      </div>
    </>
  );
}

function OwnRow({ e, brand, day }: { e: OwnEvent; brand: string; day: string }) {
  const place = e.mode === "ONLINE" ? "Online" : e.venue ?? e.campuses?.map((c) => c.campus.city ?? c.campus.name).join(", ");
  const multi = dayKey(e.startsAt) !== dayKey(e.endsAt);
  return (
    <Link href={`/events/${e.slug}`} className="card-glow group flex items-center gap-4 rounded-brand border border-border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
      <span className="h-12 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="rounded-full bg-primary px-2 py-0.5 text-primary-fg">{brand}</span><span className="text-accent">{eventLabel(e)}</span>
        </p>
        <p className="mt-1 truncate font-heading text-base font-bold group-hover:text-primary">{e.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span>{multi ? `${short(e.startsAt)} – ${short(e.endsAt)}` : time(e.startsAt)}{multi && dayKey(e.startsAt) !== day ? " (ongoing)" : ""}</span>
          {place && <span className="inline-flex items-center gap-1">{e.mode === "ONLINE" ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{place}</span>}
        </p>
      </div>
      <span className="hidden text-sm font-semibold text-primary sm:block">View →</span>
    </Link>
  );
}

function ExtRow({ e, note }: { e: External; note: string }) {
  return (
    <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-center gap-4 rounded-brand border border-dashed border-amber-500/60 bg-card p-4 transition hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-soft">
      {e.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-xl border border-border bg-white object-contain p-1" />
      ) : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Trophy className="h-5 w-5" /></span>}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="rounded-full border border-amber-500/60 bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">External · {e.sourceLabel}</span>
          {e.major && <span className="inline-flex items-center gap-1 text-amber-600"><Trophy className="h-3 w-3" />Major</span>}
          <span className="text-muted">{note}</span>
        </p>
        <p className="mt-1 truncate font-heading text-base font-bold">{e.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span>{short(e.startsAt)} – {short(e.endsAt)}</span>
          <span className="inline-flex items-center gap-1">{e.mode === "ONLINE" ? <><Globe className="h-3 w-3" />Online</> : <><MapPin className="h-3 w-3" />{e.location ?? "In person"}</>}</span>
          {e.prize && <span className="inline-flex items-center gap-1 font-medium text-fg/80"><Trophy className="h-3 w-3" />{e.prize}</span>}
          {e.participants ? <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{e.participants.toLocaleString("en-IN")} registered</span> : null}
          {e.organizer && <span className="truncate">by {e.organizer}</span>}
        </p>
      </div>
      <span className="hidden items-center gap-1 text-sm font-semibold text-amber-700 sm:flex">Open<ArrowUpRight className="h-4 w-4" /></span>
    </a>
  );
}
