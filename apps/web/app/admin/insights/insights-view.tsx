"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Lightbulb } from "lucide-react";
import { BarList, ColumnChart, HeatTable, LineChart } from "@/components/admin/charts";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Scorecards, type Scorecard } from "./scorecards";
import { cn } from "@/components/ui/cn";

type CampusRow = {
  id: string; name: string; events: number; participants: number; attendanceRate: number | null; rating: number | null; responses: number;
  students: number; reached: number; reach: number | null; aspects: Record<string, number>;
};
export type Insights = {
  months: number;
  totals: { events: number; participants: number; attendanceRate: number | null; rating: number | null; responses: number; nps: number | null; prevEvents: number; prevParticipants: number };
  trend: { month: string; events: number; participants: number; rating: number | null }[];
  byCampus: CampusRow[];
  byType: { type: string; events: number; participants: number; avgParticipants: number; rating: number | null }[];
  events: Scorecard[];
  campuses: { id: string; name: string }[];
};

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const ASPECTS = [
  { key: "content", label: "Content" }, { key: "speakers", label: "Speakers" },
  { key: "organisation", label: "Organisation" }, { key: "venue", label: "Venue / online" },
];
const METRICS = [
  { key: "participants", label: "Participants", unit: "" },
  { key: "events", label: "Events", unit: "" },
  { key: "reach", label: "Students reached", unit: "%" },
  { key: "attendanceRate", label: "Attendance", unit: "%" },
  { key: "rating", label: "Feedback rating", unit: "/5" },
] as const;

function Kpi({ label, value, hint, change }: { label: string; value: string; hint?: string; change?: number | null }) {
  return (
    <div className="rounded-brand border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
        {change != null && Number.isFinite(change) && (
          <span className={cn("inline-flex items-center font-semibold", change >= 0 ? "text-emerald-700" : "text-red-600")}>
            {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(change)}%
          </span>
        )}
        {hint}
      </p>
    </div>
  );
}

export function InsightsView({ data }: { data: Insights }) {
  const [view, setView] = useState<"overview" | "cards">("overview");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("participants");
  const [sort, setSort] = useState<"participants" | "rating" | "attendanceRate" | "month">("participants");
  const t = data.totals;
  const change = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  const campuses = data.byCampus.filter((c) => c.id !== "HQ");
  const hasFeedback = t.responses > 0;
  const hasAspects = data.byCampus.some((c) => Object.keys(c.aspects).length);

  const highlights = useMemo(() => {
    const out: string[] = [];
    const most = [...campuses].sort((a, b) => b.participants - a.participants)[0];
    if (most?.participants) out.push(`${most.name} had the most participants: ${most.participants.toLocaleString("en-IN")} across ${most.events} events.`);
    const rated = campuses.filter((c) => c.rating != null && c.responses >= 5).sort((a, b) => b.rating! - a.rating!);
    if (rated.length > 1) out.push(`Best-rated campus: ${rated[0].name} (${rated[0].rating}/5). Lowest: ${rated[rated.length - 1].name} (${rated[rated.length - 1].rating}/5).`);
    const reach = campuses.filter((c) => c.reach != null && c.students >= 10).sort((a, b) => b.reach! - a.reach!);
    if (reach.length && reach[0].reach) out.push(`${reach[0].name} reached ${reach[0].reach}% of its students; ${reach[reach.length - 1].name} ${reach[reach.length - 1].reach}%.`);
    const top = data.events[0];
    if (top) out.push(`Biggest event: ${top.title} with ${top.participants.toLocaleString("en-IN")} participants.`);
    const bestEvent = data.events.filter((e) => e.rating != null && e.responses >= 5).sort((a, b) => b.rating! - a.rating!)[0];
    if (bestEvent) out.push(`Highest-rated event: ${bestEvent.title} (${bestEvent.rating}/5 from ${bestEvent.responses} responses).`);
    const type = data.byType[0];
    if (type) out.push(`${type.type} events drew the most people (${type.avgParticipants} on average).`);
    const c = change(t.participants, t.prevParticipants);
    if (c != null) out.push(`Participants are ${c >= 0 ? "up" : "down"} ${Math.abs(c)}% on the previous ${data.months} months.`);
    if (!hasFeedback) out.push("No feedback has been collected yet. Ratings appear here after the next events (the feedback email goes out automatically).");
    return out;
  }, [campuses, data, t, hasFeedback]);

  const sorted = [...data.events].sort((a, b) =>
    sort === "month" ? b.month.localeCompare(a.month) : ((b[sort] as number | null) ?? -1) - ((a[sort] as number | null) ?? -1));
  const m = METRICS.find((x) => x.key === metric)!;

  const tabs = (
    <div className="inline-flex rounded-brand border border-border bg-bg p-1 text-sm" role="tablist">
      {([["overview", "Overview & trends"], ["cards", `Event scorecards (${data.events.length})`]] as const).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
          className={cn("rounded-[calc(var(--radius)-4px)] px-4 py-1.5 font-semibold", view === k ? "bg-card text-primary shadow-sm" : "text-muted")}>{l}</button>
      ))}
    </div>
  );
  if (view === "cards") return <div className="space-y-5">{tabs}<Scorecards events={data.events} /></div>;

  return (
    <div className="space-y-6">
      {tabs}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Events" value={String(t.events)} change={change(t.events, t.prevEvents)} hint={t.prevEvents ? "vs previous period" : undefined} />
        <Kpi label="Participants" value={t.participants.toLocaleString("en-IN")} change={change(t.participants, t.prevParticipants)} hint={t.prevParticipants ? "vs previous period" : undefined} />
        <Kpi label="Attendance" value={t.attendanceRate != null ? `${t.attendanceRate}%` : "–"} hint={t.attendanceRate == null ? "Needs check-ins" : "of registered"} />
        <Kpi label="Feedback" value={t.rating != null ? `${t.rating}/5` : "–"} hint={`${t.responses} responses`} />
        <Kpi label="Recommend" value={t.nps != null ? `${t.nps}/10` : "–"} hint="would recommend" />
        <Kpi label="Campuses" value={String(campuses.filter((c) => c.events).length)} hint="ran events" />
      </div>

      <Card>
        <CardHeader title="Highlights" />
        <CardBody>
          <ul className="space-y-2 text-sm">
            {highlights.map((h) => <li key={h} className="flex gap-2"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{h}</li>)}
          </ul>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Participants by month" description="Registrations on the site, or the turnout recorded for older events" />
          <CardBody><ColumnChart label="Participants by month" data={data.trend.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.participants, extra: `${x.events} event${x.events === 1 ? "" : "s"}` }))} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Events by month" />
          <CardBody><ColumnChart label="Events by month" data={data.trend.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.events }))} /></CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Feedback rating by month" description="Average overall rating (1–5)" />
        <CardBody>
          {data.trend.some((x) => x.rating != null)
            ? <LineChart label="Feedback rating by month" data={data.trend.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.rating }))} />
            : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No feedback yet. The trend appears once events collect ratings.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Campus comparison" description="Central (HQ) events are shown separately. Reach = share of a campus's current students who took part in at least one event." />
        <CardBody className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((x) => (
              <button key={x.key} type="button" onClick={() => setMetric(x.key)}
                className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", metric === x.key ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-primary/50")}>{x.label}</button>
            ))}
          </div>
          <BarList
            unit={m.unit} max={m.key === "rating" ? 5 : m.unit === "%" ? 100 : undefined}
            empty={m.key === "reach" ? "No students have registered on the site yet." : m.key === "rating" ? "No feedback yet." : m.key === "attendanceRate" ? "No check-ins recorded yet." : "No data yet"}
            data={(m.key === "reach" ? campuses : data.byCampus).map((c) => ({
              key: c.id, label: c.name, value: c[m.key] as number | null,
              detail: [`${c.events} events · ${c.participants.toLocaleString("en-IN")} participants`, ...(c.students ? [`${c.reached} of ${c.students} students reached`] : []), ...(c.rating != null ? [`Feedback ${c.rating}/5 (${c.responses})`] : [])],
            })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Event types" description="Total participants by type" />
          <CardBody>
            <BarList data={data.byType.map((x) => ({ key: x.type, label: x.type, value: x.participants, detail: [`${x.events} events · ${x.avgParticipants} on average`, ...(x.rating != null ? [`Feedback ${x.rating}/5`] : [])] }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Feedback by area and campus" description="Average rating (1–5) per part of the event" />
          <CardBody>
            {hasAspects ? (
              <HeatTable corner="Campus" cols={ASPECTS} rows={data.byCampus.filter((c) => Object.keys(c.aspects).length).map((c) => ({ key: c.id, label: c.name, values: c.aspects }))} />
            ) : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Area ratings (content, speakers, organisation, venue) appear once participants fill in the new feedback form.</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="All events" description="Click a column to rank by it" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Event</th>
                <th className="px-3 py-3">Campus</th>
                {([["month", "Month"], ["participants", "Participants"], ["attendanceRate", "Attendance"], ["rating", "Rating"]] as const).map(([k, l]) => (
                  <th key={k} className="px-3 py-3 text-right">
                    <button type="button" onClick={() => setSort(k)} className={cn("uppercase hover:text-fg", sort === k && "text-primary")}>{l}{sort === k ? " ↓" : ""}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2.5"><Link href={`/admin/events/${e.id}?tab=report`} className="font-medium hover:text-primary">{e.title}</Link><span className="block text-xs text-muted">{e.type}</span></td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-muted">{e.campus}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted">{monthLabel(e.month)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{e.participants.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{e.attendanceRate != null ? `${e.attendanceRate}%` : "–"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{e.rating != null ? `${e.rating}/5` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
