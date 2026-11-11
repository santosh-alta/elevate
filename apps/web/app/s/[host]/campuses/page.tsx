import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { apiListPublicFor } from "@/lib/api";
import { notFound } from "next/navigation";
import { tenantForHost } from "@/lib/tenant";
import { originFor, sharePreview } from "@/lib/brand-meta";
import { campusHref, campusTitle } from "@/lib/format";
import type { CampusSummary } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { EmptyState } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const host = decodeURIComponent((await params).host);
  const tenant = await tenantForHost(host);
  return { title: "Campuses", ...sharePreview(tenant, originFor(host), "campuses", `Campuses · ${tenant?.name ?? ""}`, undefined, "/campuses") };
}

/** Every campus, with its photo and what is coming up there. */
export default async function CampusesPage({ params }: { params: Promise<{ host: string }> }) {
  const host = decodeURIComponent((await params).host);
  const [found, campuses] = await Promise.all([tenantForHost(host), apiListPublicFor<CampusSummary>(host, "/campuses", 60)]);
  if (!found) notFound();
  const tenant = found;
  const short = tenant.name.split(" ")[0];
  return (
    <>
      <PageHero
        eyebrow="Campuses"
        title={`${campuses.length} campuses, one community`}
        description={`Find what’s happening at your ${short} campus: upcoming events, past highlights and photos.`}
      />
      <div className="mx-auto max-w-6xl px-4 py-12">
        {campuses.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campuses.map((c) => (
              <Link
                key={c.id}
                href={campusHref(c)}
                data-reveal
                className="card-glow group overflow-hidden rounded-brand border border-border/80 bg-card shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-hero-bg">
                  {c.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-hero-bg/90 via-hero-bg/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-hero-fg">
                    <p className="font-heading text-2xl font-bold tracking-tight">{campusTitle(c, short)}</p>
                    <p className="flex items-center gap-1 text-sm text-hero-fg/85"><MapPin className="h-3.5 w-3.5" />{c.details?.university ?? c.name}</p>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-gradient" />
                </div>
                <div className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span className="flex items-center gap-1.5 text-muted">
                    <CalendarDays className="h-4 w-4" />
                    {c.upcoming ? `${c.upcoming} upcoming` : "No upcoming events yet"}{c.past ? ` · ${c.past} held` : ""}
                  </span>
                  <span className="flex items-center gap-1 font-medium text-primary">Explore<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                </div>
              </Link>
            ))}
          </div>
        ) : <EmptyState title="No campuses yet" description="Campuses appear here once they are added." />}
      </div>
    </>
  );
}
