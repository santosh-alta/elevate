"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Small, dependency-free charts for the Insights page. One brand hue per chart (CSS --primary), so they
 * follow the day/night theme. Thin bars with rounded ends, recessive gridlines, a hover tooltip on every mark.
 */

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-[9rem] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lift"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="font-semibold text-fg">{tip.title}</p>
      {tip.lines.map((l) => <p key={l} className="text-muted">{l}</p>)}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-IN");
const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/** Vertical bars over time (e.g. participants per month). */
export function ColumnChart({ data, height = 180, unit = "", label }: {
  data: { key: string; label: string; value: number; extra?: string }[]; height?: number; unit?: string; label: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  return (
    <figure className="relative" aria-label={label}>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-[10px] text-muted" style={{ height }}>
          {[...ticks].reverse().map((t) => <span key={t}>{fmt(Math.round(t))}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0" style={{ height: height - 24 }}>
            {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-border/60" style={{ bottom: `${(t / max) * 100}%` }} />)}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: height - 24 }} onMouseLeave={() => setTip(null)}>
            {data.map((d) => {
              const h = (d.value / max) * 100;
              return (
                <div
                  key={d.key} className="group flex h-full flex-1 cursor-default items-end justify-center"
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: d.label, lines: [`${fmt(d.value)}${unit}`, ...(d.extra ? [d.extra] : [])] });
                  }}
                >
                  <div
                    className={cn("w-full max-w-[28px] rounded-t-[4px] bg-primary transition-opacity", d.value ? "group-hover:opacity-80" : "")}
                    style={{ height: d.value ? `max(${h}%, 3px)` : 0 }}
                  />
                </div>
              );
            })}
            <Tooltip tip={tip} />
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-muted">
            {data.map((d, i) => <span key={d.key} className="flex-1 truncate text-center">{data.length > 12 && i % 2 ? "" : d.label.split(" ")[0]}</span>)}
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Line for an average over time (e.g. feedback rating 1–5); gaps where there's no data. */
export function LineChart({ data, min = 1, max = 5, height = 160, label }: {
  data: { key: string; label: string; value: number | null }[]; min?: number; max?: number; height?: number; label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = height;
  const x = (i: number) => (data.length === 1 ? w / 2 : (i / (data.length - 1)) * (w - 20) + 10);
  const y = (v: number) => h - 20 - ((v - min) / (max - min)) * (h - 30);
  const segs: string[] = [];
  let cur = "";
  data.forEach((d, i) => {
    if (d.value == null) { if (cur) segs.push(cur); cur = ""; return; }
    cur += `${cur ? "L" : "M"}${x(i)},${y(d.value)} `;
  });
  if (cur) segs.push(cur);
  const hv = hover != null ? data[hover] : null;
  return (
    <figure className="relative" aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * w;
          let best = 0;
          data.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
          setHover(best);
        }}>
        {[min, (min + max) / 2, max].map((t) => (
          <g key={t}>
            <line x1={0} x2={w} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={0} y={y(t) - 3} className="fill-muted text-[10px]">{t}</text>
          </g>
        ))}
        {segs.map((d) => <path key={d} d={d} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {data.map((d, i) => d.value != null && (
          <circle key={d.key} cx={x(i)} cy={y(d.value)} r={hover === i ? 6 : 4} className="fill-primary stroke-card" strokeWidth={2} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h - 20} className="stroke-muted" strokeDasharray="3 3" strokeWidth={1} />}
        {data.map((d, i) => (data.length <= 12 || i % 2 === 0) && <text key={d.key} x={x(i)} y={h - 4} textAnchor="middle" className="fill-muted text-[10px]">{d.label.split(" ")[0]}</text>)}
      </svg>
      {hv && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-soft">
          <p className="font-semibold">{hv.label}</p>
          <p className="text-muted">{hv.value != null ? `${hv.value} / ${max}` : "No feedback"}</p>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars to compare items (campuses, event types). */
export function BarList({ data, unit = "", max: fixedMax, empty = "No data yet" }: {
  data: { key: string; label: string; value: number | null; note?: string; detail?: string[] }[]; unit?: string; max?: number; empty?: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const vals = data.map((d) => d.value ?? 0);
  const max = fixedMax ?? niceMax(Math.max(0, ...vals));
  if (!data.some((d) => d.value != null && d.value > 0)) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="relative space-y-2.5" onMouseLeave={() => setTip(null)}>
      {data.map((d) => (
        <div
          key={d.key} className="group grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3"
          onMouseMove={(e) => {
            const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
            setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: d.label, lines: [d.value != null ? `${fmt(d.value)}${unit}` : "No data", ...(d.detail ?? [])] });
          }}
        >
          <span className="truncate text-sm" title={d.label}>{d.label}</span>
          <span className="relative h-3 overflow-hidden rounded-full bg-fg/[0.06]">
            {d.value != null && d.value > 0 && <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-opacity group-hover:opacity-80" style={{ width: `${Math.min(100, (d.value / max) * 100)}%` }} />}
          </span>
          <span className="w-16 text-right text-sm font-semibold tabular-nums">{d.value != null ? `${fmt(d.value)}${unit}` : <span className="font-normal text-muted">–</span>}</span>
        </div>
      ))}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Table with one hue shaded by value (e.g. feedback 1–5 by area and campus). */
export function HeatTable({ rows, cols, min = 1, max = 5, corner }: {
  rows: { key: string; label: string; values: Record<string, number | undefined> }[]; cols: { key: string; label: string }[]; min?: number; max?: number; corner: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-sm">
        <thead><tr><th className="p-2 text-left text-xs font-medium text-muted">{corner}</th>{cols.map((c) => <th key={c.key} className="p-2 text-center text-xs font-medium text-muted">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="whitespace-nowrap p-2 pr-4">{r.label}</td>
              {cols.map((c) => {
                const v = r.values[c.key];
                const t = v == null ? 0 : Math.max(0.08, (v - min) / (max - min));
                return (
                  <td key={c.key} title={v != null ? `${r.label} · ${c.label}: ${v}/${max}` : "No ratings"} className="rounded-[4px] p-2 text-center font-semibold tabular-nums"
                    style={{ background: v == null ? "transparent" : `rgb(var(--primary) / ${0.12 + t * 0.78})`, color: v != null && t > 0.55 ? "rgb(var(--primary-fg))" : undefined }}>
                    {v ?? <span className="font-normal text-muted">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
