import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { EVENT_FAMILIES } from "@elevate/shared";
import { apiPublic } from "@/lib/api";
import { getOrigin, getTenant, requireTenant } from "@/lib/tenant";
import { sharePreview } from "@/lib/brand-meta";
import { eventFamily, eventLabel, fmtDate, isFamily, typeLabel } from "@/lib/format";
import type { ElevateEvent, Winner } from "@/lib/types";
import { Badge, Button, EmptyState, Select } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { WinnersPodium } from "@/components/event-extras";

export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getOrigin()]);
  const short = tenant?.name.split(" ")[0] ?? "";
  return { title: "Winners hall of fame", ...sharePreview(tenant, origin, "winners", `Winners hall of fame · ${short}`, undefined, "/winners") };
}

interface HallEntry { event: Pick<ElevateEvent, "id" | "slug" | "title" | "type" | "startsAt" | "coverImageUrl" | "category" | "family">; winners: Winner[] }

/** Accepts `[{ event, winners }]` or events carrying `winners` (or `teams`) directly. */
function normalize(raw: unknown): HallEntry[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? ((raw as Record<string, unknown>).items ?? (raw as Record<string, unknown>).events) : [];
  if (!Array.isArray(list)) return [];
  return (list as Record<string, unknown>[]).map((x) => {
    const event = (x.event ?? x) as HallEntry["event"];
    const ws = (x.winners ?? x.teams ?? (x.event ? undefined : (x as { winners?: unknown }).winners) ?? []) as Record<string, unknown>[];
    return {
      event,
      winners: ws.map((w) => ({
        teamId: String(w.teamId ?? w.id ?? ""), teamName: String(w.teamName ?? w.name ?? "Team"),
        award: (w.award as string) ?? null, rank: (w.rank as number) ?? null, projectTitle: (w.projectTitle as string) ?? null,
        members: Array.isArray(w.members) ? (w.members as { name?: string; user?: { name: string; avatarUrl?: string } ; avatarUrl?: string }[]).map((m) => ({ name: m.name ?? m.user?.name ?? "", avatarUrl: m.avatarUrl ?? m.user?.avatarUrl ?? null })) : undefined,
      })),
    };
  }).filter((e) => e.event?.slug && e.winners.length);
}

export default async function WinnersPage({ searchParams }: { searchParams: Promise<{ type?: string; year?: string; family?: string }> }) {
  const sp = await searchParams;
  const tenant = await requireTenant();
  const qs = new URLSearchParams();
  const family = isFamily(sp.family) ? sp.family : undefined;
  if (family) qs.set("family", family);
  if (sp.type) qs.set("type", sp.type);
  if (sp.year) qs.set("year", sp.year);
  const entries = normalize(await apiPublic<unknown>(`/winners${qs.size ? `?${qs}` : ""}`))
    .filter((e) => !family || eventFamily(e.event) === family)
    .sort((a, b) => +new Date(b.event.startsAt) - +new Date(a.event.startsAt));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  return (
    <>
    <PageHero
      eyebrow={<span className="inline-flex items-center gap-2 font-semibold uppercase tracking-[0.16em]"><Trophy className="h-4 w-4 text-hero-accent" />Winners</span>}
      title="Hall of fame"
      description={`Winning teams from hackathons and competitions at ${tenant.name}.`}
      className="pb-10"
    />
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <form className="relative -mt-8 grid gap-3 rounded-brand border border-border bg-card p-4 shadow-lg sm:grid-cols-4">
        <Select name="family" defaultValue={family ?? ""} aria-label="Kind of event">
          <option value="">All kinds of events</option>
          {EVENT_FAMILIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </Select>
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Event type">
          <option value="">All event types</option>
          {EVENT_FAMILIES.filter((f) => !family || f.key === family).map((f) => (
            <optgroup key={f.key} label={f.label}>{f.types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</optgroup>
          ))}
        </Select>
        <Select name="year" defaultValue={sp.year ?? ""} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Button type="submit">Apply filters</Button>
      </form>

      <div className="mt-10 space-y-12">
        {entries.length ? entries.map((e) => (
          <section key={e.event.id ?? e.event.slug}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link href={`/events/${e.event.slug}`} className="font-heading text-2xl font-bold tracking-tight underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-accent">{e.event.title}</Link>
                <p className="text-sm text-muted">{fmtDate(e.event.startsAt)}</p>
              </div>
              <Badge tone="primary">{eventLabel(e.event)}</Badge>
            </div>
            <WinnersPodium winners={e.winners} />
          </section>
        )) : <EmptyState title="No winners yet" description="Results show up here once organisers publish them." />}
      </div>
    </div>
    </>
  );
}
