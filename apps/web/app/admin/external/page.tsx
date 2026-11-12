import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Globe, MapPin, Plus, RefreshCw, Trophy, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import { isBrandAdmin, getMe, requireStaffPage } from "@/lib/auth";
import { ApiButton } from "@/components/client/api-button";
import { ExternalEditButton, ExternalEventForm } from "@/components/admin/external-event-form";
import { Badge, Card, CardHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Outside events" };

type Item = {
  id: string; source: string; sourceLabel: string; title: string; organizer?: string | null; url: string; imageUrl?: string | null;
  startsAt: string; endsAt: string; registrationEndsAt?: string | null; mode: string; location?: string | null; prize?: string | null;
  participants?: number | null; tags: string[]; major: boolean; status: "SUGGESTED" | "APPROVED" | "HIDDEN"; reviewedAt?: string | null;
  summary?: string | null; coverUrl?: string | null; teamSize?: string | null; kind?: string;
};
type Payload = {
  items: Item[]; counts: Partial<Record<Item["status"] | "MANUAL", number>>;
  settings: { enabled: boolean; autoApproveMajor: boolean; sources: string[]; lastSyncAt?: string; lastResult?: Record<string, number | string> };
  sources: { key: string; label: string }[];
};

const TABS = [
  { key: "SUGGESTED", label: "Waiting for review" },
  { key: "APPROVED", label: "Shown on calendar" },
  { key: "HIDDEN", label: "Hidden" },
  { key: "MANUAL", label: "Added by team" },
] as const;
const d = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Hackathons on other platforms: what gets shown to students on the public calendar. */
export default async function ExternalEventsPage({ searchParams }: { searchParams: Promise<{ status?: string; major?: string }> }) {
  await requireStaffPage();
  const admin = isBrandAdmin(await getMe());
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "SUGGESTED";
  const data = await apiGet<Payload>(status === "MANUAL" ? "/admin/external-events?source=manual" : `/admin/external-events?status=${status}`);
  if (!data) return <p className="text-muted">Couldn&apos;t load outside events.</p>;
  const items = sp.major === "1" ? data.items.filter((i) => i.major) : data.items;
  const s = data.settings;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Outside events</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Hackathons and competitions on Unstop, Devfolio, MLH and Devpost that students can join, pulled every day. Approved ones appear on the public <Link href="/calendar" className="font-medium text-primary hover:underline">calendar</Link>, marked “External”.
          </p>
        </div>
        <div className="flex gap-2">
        <a href="#add" className="inline-flex h-9 items-center gap-1.5 rounded-brand bg-primary px-3 text-sm font-semibold text-primary-fg hover:opacity-90"><Plus className="h-4 w-4" />Add manually</a>
        {admin && <ApiButton path="/admin/external-events/sync" variant="outline" size="sm" successMessage="Pulled the latest listings"><RefreshCw className="h-4 w-4" />Pull now</ApiButton>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/external?status=${t.key}`} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", status === t.key ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}>
            {t.label} · {data.counts[t.key] ?? 0}
          </Link>
        ))}
        <Link href={`/admin/external?status=${status}${sp.major === "1" ? "" : "&major=1"}`} className={cn("ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm", sp.major === "1" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-border")}>
          <Trophy className="h-4 w-4 text-amber-500" />Major only
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {!items.length && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Nothing here. {status === "SUGGESTED" ? "New listings arrive with the daily pull." : ""}</p>}
          {items.map((e) => (
            <Card key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
              {e.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-xl border border-border bg-white object-contain p-1" />
              ) : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Trophy className="h-5 w-5" /></span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="amber">{e.sourceLabel}</Badge>
                  {e.major && <Badge tone="highlight"><Trophy className="h-3 w-3" />Major</Badge>}
                  {e.status === "APPROVED" && !e.reviewedAt && <span className="text-xs text-muted">shown automatically</span>}
                  {e.source === "manual" && <Badge tone="primary">Added by team</Badge>}
                  {e.kind === "CONTEST" && <Badge tone="purple">Coding contest</Badge>}
                  {status === "MANUAL" && e.status === "HIDDEN" && <Badge>Hidden</Badge>}
                </div>
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 font-semibold hover:text-primary">{e.title}<ArrowUpRight className="h-3.5 w-3.5" /></a>
                <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{d(e.startsAt)} – {d(e.endsAt)}{e.registrationEndsAt ? ` · apply by ${d(e.registrationEndsAt)}` : ""}</span>
                  <span className="inline-flex items-center gap-1">{e.mode === "ONLINE" ? <><Globe className="h-3 w-3" />Online</> : <><MapPin className="h-3 w-3" />{e.location ?? "In person"}</>}</span>
                  {e.prize && <span>{e.prize}</span>}
                  {e.participants ? <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{e.participants.toLocaleString("en-IN")}</span> : null}
                  {e.organizer && <span className="truncate">by {e.organizer}</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {e.status !== "APPROVED" && <ApiButton method="PATCH" path={`/admin/external-events/${e.id}`} body={{ status: "APPROVED" }} size="sm">Show</ApiButton>}
                {e.status !== "HIDDEN" && <ApiButton method="PATCH" path={`/admin/external-events/${e.id}`} body={{ status: "HIDDEN" }} size="sm" variant="outline">Hide</ApiButton>}
                {e.source === "manual" && <ApiButton method="DELETE" path={`/admin/external-events/${e.id}`} size="sm" variant="ghost" confirm="Delete this listing?">Delete</ApiButton>}
              </div>
              {e.source === "manual" && <ExternalEditButton item={e} />}
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Settings" description={s.lastSyncAt ? `Last pulled ${new Date(s.lastSyncAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}` : "Not pulled yet"} />
            <div className="space-y-3 p-5 text-sm">
              {s.lastResult && (
                <ul className="space-y-0.5 text-xs text-muted">
                  {Object.entries(s.lastResult).map(([k, v]) => <li key={k}>{data.sources.find((x) => x.key === k)?.label ?? k}: {typeof v === "number" ? `${v} listings` : v}</li>)}
                </ul>
              )}
              {admin ? (
                <>
                  <Toggle on={s.enabled} label="Show outside events on the calendar" body={{ enabled: !s.enabled }} />
                  <Toggle on={s.autoApproveMajor} label="Show major ones automatically" hint="Big prizes or lots of registrations; online, or near a campus. Others wait here for review." body={{ autoApproveMajor: !s.autoApproveMajor }} />
                  <p className="pt-2 font-medium">Sources</p>
                  {data.sources.map((src) => {
                    const on = s.sources.includes(src.key);
                    return <Toggle key={src.key} on={on} label={src.label} body={{ sources: on ? s.sources.filter((x) => x !== src.key) : [...s.sources, src.key] }} />;
                  })}
                </>
              ) : <p className="text-muted">Admins can change these settings.</p>}
            </div>
          </Card>

          <Card id="add" className="scroll-mt-24">
            <CardHeader title="Add one yourself" description="Found a good hackathon or competition anywhere else? Paste its link, press Fill from link, check the details and add it. It shows on the calendar straight away." />
            <div className="p-5"><ExternalEventForm /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, label, hint, body }: { on: boolean; label: string; hint?: string; body: Record<string, unknown> }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p>{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <ApiButton method="PATCH" path="/admin/external-events-settings" body={body} size="sm" variant={on ? "primary" : "outline"} className="min-w-[60px]">{on ? "On" : "Off"}</ApiButton>
    </div>
  );
}
