import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Globe, Linkedin } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getOrigin } from "@/lib/tenant";
import { fmtDate, fmtDateTime, humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent, Guest } from "@/lib/types";
import { Badge, Card, LinkButton } from "@/components/ui";
import { GuestAvatar } from "@/components/guest-avatar";

type Props = { params: Promise<{ id: string }> };

interface SpeakerPayload extends Partial<Guest> {
  guest?: Guest; websiteUrl?: string | null; expertise?: string[]; city?: string | null;
  events?: (ElevateEvent & { appearance?: Partial<Guest> })[];
  appearances?: (Partial<Guest> & { event?: ElevateEvent })[];
}

/** Accepts `{ guest, events }` or a flat guest with `events` / `appearances`. */
async function loadSpeaker(id: string) {
  const d = await apiGet<SpeakerPayload>(`/speakers/${encodeURIComponent(id)}`);
  if (!d) return null;
  const g = { ...(d.guest ?? {}), ...d } as SpeakerPayload & Guest;
  if (!g.name) return null;
  const events: { event: ElevateEvent; talkTitle?: string | null; role?: string }[] = [];
  for (const e of d.events ?? []) events.push({ event: e, talkTitle: e.appearance?.talkTitle, role: e.appearance?.role });
  for (const a of d.appearances ?? []) if (a.event && !events.some((x) => x.event.id === a.event!.id)) events.push({ event: a.event, talkTitle: a.talkTitle, role: a.role });
  if (g.event && !events.some((x) => x.event.id === g.event!.id)) events.push({ event: g.event, talkTitle: g.talkTitle, role: g.role });
  events.sort((a, b) => +new Date(b.event.startsAt) - +new Date(a.event.startsAt));
  return { g, events };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await loadSpeaker(id);
  if (!s) return { title: "Speaker" };
  const description = [s.g.designation, s.g.organization].filter(Boolean).join(", ") || s.g.bio?.slice(0, 160);
  return {
    title: s.g.name,
    description: description || undefined,
    openGraph: { title: s.g.name, description: description || undefined, images: s.g.photoUrl ? [{ url: s.g.photoUrl }] : undefined, url: `${await getOrigin()}/speakers/${id}` },
  };
}

export default async function SpeakerPage({ params }: Props) {
  const { id } = await params;
  const s = await loadSpeaker(id);
  if (!s) notFound();
  const { g, events } = s;
  const upcoming = events.filter((e) => new Date(e.event.endsAt) >= new Date());
  const past = events.filter((e) => new Date(e.event.endsAt) < new Date());

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary to-accent" />
        <div className="-mt-12 flex flex-col gap-6 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="rounded-full border-4 border-card bg-card"><GuestAvatar guest={g} size="h-28 w-28" /></div>
          <div className="min-w-0 flex-1">
            {g.role && <Badge tone="primary">{humanize(g.role)}</Badge>}
            <h1 className="mt-1 text-3xl font-bold">{g.name}</h1>
            <p className="text-muted">{[g.designation, g.organization].filter(Boolean).join(", ")}{g.city ? ` · ${g.city}` : ""}</p>
          </div>
          <div className="flex gap-2">
            {g.linkedinUrl && <LinkButton href={g.linkedinUrl} external variant="outline" size="sm"><Linkedin className="h-4 w-4" />LinkedIn</LinkButton>}
            {g.websiteUrl && <LinkButton href={g.websiteUrl} external variant="outline" size="sm"><Globe className="h-4 w-4" />Website</LinkButton>}
          </div>
        </div>
      </Card>

      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <div className="space-y-8 md:col-span-2">
          {g.bio && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">About</h2>
              <p className="whitespace-pre-line leading-relaxed text-fg/90">{g.bio}</p>
            </section>
          )}
          {g.talkTitle && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Talk</h2>
              <Card className="p-5">
                <p className="font-semibold">{g.talkTitle}</p>
                {g.sessionAt && <p className="mt-1 text-sm text-muted">{fmtDateTime(g.sessionAt)}</p>}
                {g.talkAbstract && <p className="mt-3 whitespace-pre-line text-sm text-fg/80">{g.talkAbstract}</p>}
              </Card>
            </section>
          )}
          {(g.expertise?.length ?? 0) > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Expertise</h2>
              <div className="flex flex-wrap gap-2">{g.expertise!.map((x) => <Badge key={x}>{x}</Badge>)}</div>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          {[["Upcoming", upcoming], ["Past events", past]].map(([label, list]) => (list as typeof events).length > 0 && (
            <section key={label as string}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{label as string}</h2>
              <ul className="space-y-2">
                {(list as typeof events).map(({ event, talkTitle }) => (
                  <li key={event.id}>
                    <Link href={`/events/${event.slug}`} className="block rounded-lg border border-border bg-card p-3 text-sm transition hover:border-primary/50">
                      <p className="font-medium">{event.title}</p>
                      <p className="flex items-center gap-1 text-xs text-muted"><CalendarDays className="h-3 w-3" />{fmtDate(event.startsAt)} · {typeLabel(event.type)}</p>
                      {talkTitle && <p className="mt-1 text-xs text-fg/80">“{talkTitle}”</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}
