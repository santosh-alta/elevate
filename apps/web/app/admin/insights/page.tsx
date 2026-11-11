import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { InsightsView, type Insights } from "./insights-view";

export const metadata: Metadata = { title: "Insights" };

/** How events performed: trends over time, and comparisons across campuses and event types. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ months?: string; campus?: string }> }) {
  await requireStaffPage();
  const { months = "12", campus = "" } = await searchParams;
  const data = await apiGet<Insights>(`/insights?months=${encodeURIComponent(months)}${campus ? `&campusId=${encodeURIComponent(campus)}` : ""}`);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
          <p className="text-sm text-muted">How events performed, compared across campuses, event types and months. Finished events only.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm" role="search">
          <select name="months" defaultValue={months} className="h-10 rounded-brand border border-border bg-card px-3" aria-label="Period">
            {[3, 6, 12, 24].map((m) => <option key={m} value={m}>Last {m} months</option>)}
          </select>
          <select name="campus" defaultValue={campus} className="h-10 rounded-brand border border-border bg-card px-3" aria-label="Campus">
            <option value="">All campuses</option>
            {(data?.campuses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="h-10 rounded-brand bg-primary px-4 font-semibold text-primary-fg">Apply</button>
          {(campus || months !== "12") && <Link href="/admin/insights" className="text-muted hover:text-fg">Reset</Link>}
        </form>
      </div>
      {data ? <InsightsView data={data} /> : (
        <Card><CardHeader title="Insights" /><CardBody><EmptyState title="Couldn't load insights" description="Please try again in a moment." /></CardBody></Card>
      )}
    </div>
  );
}
