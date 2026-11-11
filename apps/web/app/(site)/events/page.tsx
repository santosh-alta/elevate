import type { Metadata } from "next";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { EVENT_FAMILIES, EVENT_MODES } from "@elevate/shared";
import { apiListPublic } from "@/lib/api";
import { getTags } from "@/lib/catalog";
import { requireTenant } from "@/lib/tenant";
import { eventFamily, familyLabel, humanize, isFamily, typeLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { EventCard } from "@/components/event-card";
import { EventIcon } from "@/components/event-icon";
import { FilterChip, hrefWith } from "@/components/filter-chips";
import { Button, EmptyState, Input, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Events" };

const KEYS = ["q", "family", "tag", "type", "campusId", "mode", "when"] as const;

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const k of KEYS) { const v = raw[k]; sp[k] = (Array.isArray(v) ? v[0] : v)?.trim() || undefined; }
  const family = isFamily(sp.family) ? sp.family : undefined;
  const tenant = await requireTenant();

  const qs = new URLSearchParams();
  if (sp.q) qs.set("q", sp.q);
  if (family) qs.set("family", family);
  if (sp.tag) qs.set("tag", sp.tag);
  if (sp.type) qs.set("type", sp.type);
  if (sp.campusId) qs.set("campusId", sp.campusId);
  const when = sp.when === "all" || sp.when === "past" ? sp.when : "upcoming";
  if (when === "upcoming") qs.set("upcoming", "1");
  if (when === "past") qs.set("past", "1");
  let [list, tags] = await Promise.all([apiListPublic<ElevateEvent>(`/events?${qs}`), getTags()]);
  // Nothing coming up: show past events rather than an empty page.
  let showingPast = false;
  if (when === "upcoming" && !list.length) {
    qs.delete("upcoming"); qs.set("past", "1");
    list = await apiListPublic<ElevateEvent>(`/events?${qs}`);
    showingPast = list.length > 0;
  }

  // The API filters; repeat the cheap checks here so older API versions still behave.
  const q = sp.q?.toLowerCase();
  const tag = sp.tag?.toLowerCase();
  const events = list.filter((e) =>
    (!sp.mode || e.mode === sp.mode)
    && (!family || eventFamily(e) === family)
    && (!tag || !e.tags || e.tags.some((t) => t.toLowerCase() === tag))
    && (!q || `${e.title} ${e.tagline ?? ""}`.toLowerCase().includes(q)),
  );

  const topTags = tags.slice(0, 14).map((t) => t.tag);
  if (sp.tag && !topTags.some((t) => t.toLowerCase() === tag)) topTags.unshift(sp.tag);
  const familyInfo = EVENT_FAMILIES.find((f) => f.key === family);
  const active = [family && familyLabel(family), sp.tag && `#${sp.tag}`, sp.q && `“${sp.q}”`].filter(Boolean);

  return (
    <>
    <PageHero title="Events" description={`Find hackathons, workshops, seminars and more across ${tenant.name}.`} className="pb-10" />
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <form role="search" aria-label="Filter events" className="relative -mt-10 grid animate-fade-up gap-3 rounded-brand border border-border/70 bg-card p-4 shadow-lift sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        {family && <input type="hidden" name="family" value={family} />}
        {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
        {sp.type && <input type="hidden" name="type" value={sp.type} />}
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search events</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search by title or topic" className="pl-9" />
        </label>
        <Select name="campusId" defaultValue={sp.campusId ?? ""} aria-label="Campus">
          <option value="">All campuses</option>
          {tenant.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="mode" defaultValue={sp.mode ?? ""} aria-label="Mode">
          <option value="">Online & offline</option>
          {EVENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
        </Select>
        <Select name="when" defaultValue={sp.when ?? "upcoming"} aria-label="When">
          <option value="upcoming">Upcoming</option>
          <option value="past">Past events</option>
          <option value="all">All events</option>
        </Select>
        <Button type="submit" variant="cta">Search</Button>
      </form>

      <nav aria-label="Event families" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          <li><FilterChip href={hrefWith("/events", sp, { family: undefined, type: undefined })} active={!family}>All types</FilterChip></li>
          {EVENT_FAMILIES.map((f) => (
            <li key={f.key}>
              <FilterChip href={hrefWith("/events", sp, { family: f.key, type: undefined })} active={family === f.key}>
                <EventIcon name={f.icon} className="h-4 w-4" />{f.label}
              </FilterChip>
            </li>
          ))}
        </ul>
      </nav>
      {familyInfo && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{familyInfo.description}.</span>
          {familyInfo.types.length > 1 && (
            <span className="flex flex-wrap gap-1.5">
              {familyInfo.types.map((t) => (
                <Link key={t} href={hrefWith("/events", sp, { type: sp.type === t ? undefined : t })} aria-current={sp.type === t ? "true" : undefined}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${sp.type === t ? "bg-primary/10 text-primary ring-primary/40" : "text-muted ring-border hover:text-primary"}`}>
                  {typeLabel(t)}
                </Link>
              ))}
            </span>
          )}
        </div>
      )}

      {topTags.length > 0 && (
        <nav aria-label="Topics" className="mt-4 flex items-start gap-2">
          <span className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted">Topics</span>
          <ul className="flex flex-wrap gap-1.5">
            {topTags.map((t) => {
              const on = t.toLowerCase() === tag;
              return (
                <li key={t}>
                  <Link href={hrefWith("/events", sp, { tag: on ? undefined : t })} aria-current={on ? "true" : undefined} scroll={false}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? "bg-secondary text-secondary-fg ring-secondary" : "bg-card text-fg ring-border hover:text-primary hover:ring-primary/50"}`}>
                    #{t}{on && <><X className="h-3 w-3" aria-hidden /><span className="sr-only">(remove filter)</span></>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="font-semibold text-fg">{events.length}</span> {events.length === 1 ? "event" : "events"}{active.length ? ` · ${active.join(" · ")}` : ""}
          </p>
          {(family || sp.tag || sp.q || sp.type || sp.campusId || sp.mode || sp.when) && (
            <Link href="/events" className="text-sm font-medium text-primary underline decoration-accent decoration-2 underline-offset-4">Clear filters</Link>
          )}
        </div>
        {showingPast && (
          <p className="mb-4 rounded-brand bg-primary/5 p-3 text-sm text-fg">No upcoming events right now. Here&apos;s what we&apos;ve run so far; new events will appear here first.</p>
        )}
        {events.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>
        ) : (
          <EmptyState title="No events match these filters" description={sp.when === "all" ? "Try another type or topic." : "Try another type or topic, or include past events."} />
        )}
      </div>
    </div>
    </>
  );
}
