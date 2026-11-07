import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { EVENT_TYPES } from "@elevate/shared";
import { apiGet } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { fmtDate, typeLabel } from "@/lib/format";
import type { ElevateEvent, Winner } from "@/lib/types";
import { Badge, Button, EmptyState, Select } from "@/components/ui";
import { WinnersPodium } from "@/components/event-extras";

export const metadata: Metadata = { title: "Winners hall of fame" };

interface HallEntry { event: Pick<ElevateEvent, "id" | "slug" | "title" | "type" | "startsAt" | "coverImageUrl">; winners: Winner[] }

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

export default async function WinnersPage({ searchParams }: { searchParams: Promise<{ type?: string; year?: string }> }) {
  const sp = await searchParams;
  const tenant = await requireTenant();
  const qs = new URLSearchParams();
  if (sp.type) qs.set("type", sp.type);
  if (sp.year) qs.set("year", sp.year);
  const entries = normalize(await apiGet<unknown>(`/winners${qs.size ? `?${qs}` : ""}`))
    .sort((a, b) => +new Date(b.event.startsAt) - +new Date(a.event.startsAt));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15"><Trophy className="h-6 w-6 text-accent" /></span>
        <div>
          <h1 className="text-3xl font-bold">Hall of fame</h1>
          <p className="text-muted">Winning teams from hackathons and competitions at {tenant.name}.</p>
        </div>
      </div>

      <form className="mt-6 grid gap-3 rounded-brand border border-border bg-card p-4 sm:grid-cols-3">
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Event type">
          <option value="">All event types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
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
                <Link href={`/events/${e.event.slug}`} className="text-xl font-semibold hover:text-primary">{e.event.title}</Link>
                <p className="text-sm text-muted">{fmtDate(e.event.startsAt)}</p>
              </div>
              <Badge tone="primary">{typeLabel(e.event.type)}</Badge>
            </div>
            <WinnersPodium winners={e.winners} />
          </section>
        )) : <EmptyState title="No winners yet" description="Results show up here once organisers publish them." />}
      </div>
    </div>
  );
}
