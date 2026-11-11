import type { Metadata } from "next";
import { Star } from "lucide-react";
import { apiGet } from "@/lib/api";
import { requireStaffPage } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Feedback" };

type Fb = { id: string; name?: string | null; email?: string | null; campus?: string | null; rating?: number | null; liked?: string | null; confusing?: string | null; missing?: string | null; broken?: string | null; createdAt: string };

const PARTS: [keyof Fb, string][] = [["liked", "👍 Liked"], ["confusing", "🤔 Confusing"], ["missing", "💡 Missing / ideas"], ["broken", "🐞 Broken"]];

/** Feedback about the site from students and visitors. */
export default async function FeedbackAdmin() {
  await requireStaffPage();
  const data = await apiGet<{ items: Fb[]; count: number; averageRating: number | null }>("/admin/feedback");
  const items = data?.items ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feedback</h1>
          <p className="text-sm text-muted">What people said about the site. Share the link <span className="font-mono">/feedback</span> with students.</p>
        </div>
        <div className="flex gap-3">
          <Card className="px-4 py-2 text-center"><p className="text-2xl font-bold">{data?.count ?? 0}</p><p className="text-xs text-muted">responses</p></Card>
          <Card className="px-4 py-2 text-center"><p className="flex items-center justify-center gap-1 text-2xl font-bold">{data?.averageRating ? data.averageRating.toFixed(1) : "–"}<Star className="h-5 w-5 fill-amber-400 text-amber-400" /></p><p className="text-xs text-muted">average</p></Card>
        </div>
      </div>
      {items.length ? (
        <div className="space-y-4">
          {items.map((f) => (
            <Card key={f.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{f.name || "Anonymous"}{f.campus ? <span className="font-normal text-muted"> · {f.campus}</span> : null}</p>
                <div className="flex items-center gap-3 text-sm text-muted">
                  {f.rating ? <span className="flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < f.rating! ? "fill-amber-400 text-amber-400" : "text-border"}`} />)}</span> : null}
                  <span>{fmtDateTime(f.createdAt)}</span>
                </div>
              </div>
              {f.email && <p className="text-xs text-muted">{f.email}</p>}
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {PARTS.filter(([k]) => f[k]).map(([k, label]) => (
                  <div key={k} className="rounded-md bg-primary/[0.03] p-3">
                    <dt className="text-xs font-semibold text-muted">{label}</dt>
                    <dd className="mt-1 whitespace-pre-line text-sm">{f[k] as string}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      ) : <EmptyState title="No feedback yet" description="Share the /feedback link with students. Responses appear here." />}
    </div>
  );
}
