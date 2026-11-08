import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BadgeCheck, CalendarDays, ExternalLink, GraduationCap, Images, MapPin, Trophy, Users } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { campusHref, campusTitle } from "@/lib/format";
import type { CampusProfile, CampusSummary, ElevateEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { Card, EmptyState, LinkButton } from "@/components/ui";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const [c, tenant] = await Promise.all([apiGet<CampusProfile>(`/campuses/${encodeURIComponent(code)}`), requireTenant()]);
  if (!c) return { title: "Campus" };
  const title = campusTitle(c, tenant.name.split(" ")[0]);
  return { title, description: c.details?.about ?? `Events at ${c.name}`, openGraph: c.photoUrl ? { images: [{ url: c.photoUrl }] } : undefined };
}

/** One campus: who they are, what's coming up there, what's open to every campus, what they've run, and photos. */
export default async function CampusPage({ params }: Props) {
  const { code } = await params;
  const [tenant, campus] = await Promise.all([requireTenant(), apiGet<CampusProfile>(`/campuses/${encodeURIComponent(code)}`)]);
  if (!campus) notFound();
  const short = tenant.name.split(" ")[0];
  const title = campusTitle(campus, short);
  const [upcoming, past, central, all] = await Promise.all([
    apiList<ElevateEvent>(`/events?campusId=${campus.id}&campusOnly=true&upcoming=1`),
    apiList<ElevateEvent>(`/events?campusId=${campus.id}&campusOnly=true&past=1`),
    apiList<ElevateEvent>(`/events?upcoming=1`),
    apiList<CampusSummary>("/campuses"),
  ]);
  const openToAll = central.filter((e) => e.scope === "CENTRAL" && e.status !== "CANCELLED").slice(0, 6);
  const d = campus.details ?? {};
  const gallery = d.gallery ?? [];
  const others = all.filter((c) => c.id !== campus.id);

  return (
    <>
      {/* Hero: campus photo with the name over it */}
      <section className="relative isolate overflow-hidden bg-hero-bg text-hero-fg">
        {campus.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campus.photoUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-hero-bg via-hero-bg/85 to-hero-bg/40" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <Link href="/campuses" className="text-sm text-hero-fg/80 hover:text-hero-fg">← All campuses</Link>
          <h1 className="mt-3 font-heading text-4xl font-extrabold tracking-tight sm:text-6xl">{title}</h1>
          <p className="mt-3 flex items-center gap-2 text-lg text-hero-fg/90">
            <MapPin className="h-5 w-5 text-hero-accent" />
            {[d.university ?? campus.name, [campus.city, d.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          </p>
          {!!d.approvals?.length && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {d.approvals.map((a) => (
                <li key={a} className="inline-flex items-center gap-1 rounded-full bg-hero-fg/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-hero-fg/25">
                  <BadgeCheck className="h-3.5 w-3.5 text-hero-accent" />{a}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-8 h-1.5 w-20 rounded-full bg-brand-gradient" aria-hidden />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        {/* Highlights */}
        <section className="grid gap-4 sm:grid-cols-4">
          {[
            { icon: CalendarDays, value: upcoming.length, label: "Upcoming events" },
            { icon: Award, value: campus.stats.eventsHeld, label: "Events held" },
            { icon: Users, value: campus.stats.participants, label: "Students took part" },
            { icon: Trophy, value: campus.stats.hackathons, label: "Hackathons & contests" },
          ].map(({ icon: Icon, value, label }) => (
            <Card key={label} className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-primary"><Icon className="h-5 w-5" /></span>
              <div>
                <p className="font-heading text-2xl font-bold tabular-nums">{value.toLocaleString("en-IN")}</p>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
              </div>
            </Card>
          ))}
        </section>

        {/* About */}
        {(d.about || d.programme) && (
          <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 className="font-heading text-2xl font-bold tracking-tight">About the campus</h2>
              {d.about && <p className="mt-3 text-lg leading-relaxed text-muted">{d.about}</p>}
              {d.websiteUrl && (
                <a href={d.websiteUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  More about {title} on {new URL(d.websiteUrl).hostname.replace(/^www\./, "")} <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            {d.programme && (
              <Card className="h-fit p-5">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><GraduationCap className="h-4 w-4" />Programme</p>
                <p className="mt-2 font-heading text-lg font-bold">{d.programme}</p>
                <p className="mt-1 text-sm text-muted">{d.university ?? campus.name}</p>
              </Card>
            )}
          </section>
        )}

        {/* Upcoming here */}
        <section>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Upcoming at {title}</h2>
          {upcoming.length ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map((e) => <EventCard key={e.id} event={e} />)}</div>
          ) : (
            <div className="mt-5"><EmptyState title="Nothing announced yet" description={`New events at ${title} will appear here first. Meanwhile, check the events open to every campus below.`} /></div>
          )}
        </section>

        {/* Central */}
        {openToAll.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl font-bold tracking-tight">Open to all campuses</h2>
            <p className="mt-1 text-muted">Online and central events every {short} student can join.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{openToAll.map((e) => <EventCard key={e.id} event={e} />)}</div>
          </section>
        )}

        {/* Past */}
        {past.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl font-bold tracking-tight">Past events at {title}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} event={e} />)}</div>
          </section>
        )}

        {/* Event moments */}
        {campus.eventPhotos.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight"><Images className="h-6 w-6 text-primary" />Moments from our events</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {campus.eventPhotos.map((m) => (
                <Link key={m.id} href={`/events/${m.eventSlug}#gallery`} className="group relative aspect-[4/3] overflow-hidden rounded-brand bg-hero-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.caption ?? m.eventTitle} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">{m.eventTitle}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Campus gallery */}
        {gallery.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl font-bold tracking-tight">Around the campus</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((g) => (
                <a key={g.url} href={g.url} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-brand bg-hero-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt={g.caption ?? ""} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Other campuses */}
        {others.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl font-bold tracking-tight">Other campuses</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {others.map((c) => (
                <LinkButton key={c.id} href={campusHref(c)} variant="outline" size="sm"><MapPin className="h-4 w-4" />{campusTitle(c, short)}</LinkButton>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
