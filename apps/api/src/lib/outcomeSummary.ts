import type { Prisma } from "@prisma/client";
import { EVENT_TYPE_LABELS, WORK_TEAM_LABELS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { generate, stripFences } from "./ai";
import { buildOutcome } from "./outcome";
import { HttpError } from "./errors";

/**
 * AI summary of an event's outcome for leadership: verdict, what happened, why, comparison with similar past events,
 * and what to do next time. Built from the outcome numbers, task completion by team and anonymous feedback comments.
 * No names or contact details are sent. Saved inside Event.outcome.aiSummary (kept when the report is rebuilt).
 */
export type OutcomeSummary = {
  verdict: "strong" | "good" | "mixed" | "weak";
  headline: string;
  summary: string;
  highlights: string[];
  concerns: string[];
  why: string[];
  recommendations: string[];
  generatedAt: string;
  model: string;
};

type Outcome = {
  registrations?: { registered?: number; attended?: number; attendanceRate?: number };
  aiSummary?: OutcomeSummary;
  [k: string]: unknown;
};

const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : []);

export async function summariseOutcome(eventId: string): Promise<{ summary: OutcomeSummary; tokens: number }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { tenant: { select: { name: true } }, category: { select: { name: true } }, campuses: { select: { campus: { select: { name: true } } } } },
  });
  const outcome = (await buildOutcome(eventId)) as unknown as Outcome;
  const [comments, tasks, similar] = await Promise.all([
    prisma.feedback.findMany({ where: { eventId, comment: { not: null } }, select: { rating: true, comment: true }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.eventTask.findMany({ where: { eventId }, select: { title: true, team: true, status: true, dueAt: true, completedAt: true, phase: true } }),
    prisma.event.findMany({
      where: { tenantId: event.tenantId, type: event.type, status: "COMPLETED", id: { not: eventId } },
      select: { title: true, startsAt: true, outcome: true, config: true }, orderBy: { startsAt: "desc" }, take: 8,
    }),
  ]);

  // Task completion per team (no names).
  const byTeam = new Map<string, { done: number; total: number; late: string[] }>();
  for (const t of tasks) {
    const key = t.team ? WORK_TEAM_LABELS[t.team as keyof typeof WORK_TEAM_LABELS] ?? t.team : "Unassigned";
    const row = byTeam.get(key) ?? { done: 0, total: 0, late: [] };
    row.total++;
    if (t.status === "DONE" || t.status === "SKIPPED") row.done++;
    if (t.status !== "DONE" && t.status !== "SKIPPED") row.late.push(`${t.title} (${t.phase.toLowerCase()})`);
    else if (t.completedAt && t.dueAt && t.completedAt > t.dueAt) row.late.push(`${t.title} (done late)`);
    byTeam.set(key, row);
  }
  const comparables = similar.map((e) => {
    const o = (e.outcome ?? {}) as Outcome;
    const c = (e.config ?? {}) as { participants?: number };
    const reg = o.registrations?.registered || Number(c.participants) || 0;
    return `- ${e.title} (${e.startsAt.toISOString().slice(0, 10)}): ${reg ? `${reg} registered` : "no numbers"}${o.registrations?.attended ? `, ${o.registrations.attended} attended` : ""}`;
  });

  const { aiSummary: _old, ...numbers } = outcome;
  void _old;
  const prompt = [
    `Event: ${event.title} — ${event.category?.name ?? EVENT_TYPE_LABELS[event.type]} by ${event.tenant.name}`,
    `When: ${event.startsAt.toISOString().slice(0, 10)}; status ${event.status.toLowerCase()}; ${event.mode.toLowerCase()}; campuses: ${event.campuses.map((c) => c.campus.name).join(", ") || "all"}`,
    event.capacity ? `Capacity: ${event.capacity}` : "",
    "", "## Outcome numbers (JSON)", JSON.stringify(numbers).slice(0, 9000),
    "", "## Checklist by team (done/total, and items not done or done late)",
    ...[...byTeam.entries()].map(([team, r]) => `- ${team}: ${r.done}/${r.total}${r.late.length ? `; ${r.late.slice(0, 8).join("; ")}` : ""}`),
    "", `## Feedback comments (${comments.length}, anonymous)`,
    ...comments.map((c) => `- ${c.rating}/5: ${c.comment!.replace(/\s+/g, " ").slice(0, 240)}`),
    "", "## Similar past events of the same type", ...(comparables.length ? comparables : ["(none)"]),
  ].filter((l) => l !== "").join("\n");

  const r = await generate({
    system:
      "You are an analyst writing a crisp outcome review of a college event for the CEO of an institute in India. " +
      "Be direct and specific, use the numbers given, compare with similar past events where possible, and never invent data. " +
      "If data is missing (for example no feedback or no check-ins recorded), say so plainly as a concern, since it limits what can be judged.",
    prompt: [
      prompt, "",
      "Return JSON with exactly these keys:",
      '{"verdict": "strong" | "good" | "mixed" | "weak", "headline": "one line, max 15 words", "summary": "2–3 sentences",',
      '"highlights": ["what went well, with numbers"], "concerns": ["what fell short or is missing"], "why": ["likely reasons behind the results, grounded in the data"],',
      '"recommendations": ["specific actions for the next edition"]}',
      "Each list has 2–5 short items (one sentence each).",
    ].join("\n"),
    json: true,
    maxTokens: 2000,
    temperature: 0.4,
  });
  let parsed: Partial<OutcomeSummary>;
  try {
    parsed = JSON.parse(stripFences(r.text)) as Partial<OutcomeSummary>;
  } catch {
    throw new HttpError(502, "ai_bad_answer", "The AI's answer didn't make sense. Please try again.");
  }
  const summary: OutcomeSummary = {
    verdict: (["strong", "good", "mixed", "weak"] as const).includes(parsed.verdict as never) ? parsed.verdict! : "mixed",
    headline: String(parsed.headline ?? "").slice(0, 200),
    summary: String(parsed.summary ?? "").slice(0, 1200),
    highlights: list(parsed.highlights), concerns: list(parsed.concerns), why: list(parsed.why), recommendations: list(parsed.recommendations),
    generatedAt: new Date().toISOString(),
    model: r.model,
  };
  await prisma.event.update({
    where: { id: eventId },
    data: { outcome: { ...(numbers as object), aiSummary: summary } as unknown as Prisma.InputJsonValue },
  });
  return { summary, tokens: r.tokens };
}
