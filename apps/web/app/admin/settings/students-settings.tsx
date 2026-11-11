"use client";

import { useEffect, useState } from "react";
import { BellRing, Database, Loader2, RefreshCw } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Card, CardBody, CardHeader, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { Campus } from "@/lib/types";

type Summary = {
  connected: boolean; lastSyncAt: string | null; total: number; faculty?: number;
  campuses: { campusId: string | null; name: string; codes: string[]; students: number }[];
  batches: { batch: number; students: number }[];
  programs: { program: string; students: number }[];
};
type Notif = { reminderHours: number[]; announceByDefault: boolean; report: { to: string[]; cc: string[]; afterDays: number } };

const REMINDER_OPTIONS = [
  { h: 168, label: "1 week" }, { h: 72, label: "3 days" }, { h: 24, label: "1 day" },
  { h: 3, label: "3 hours" }, { h: 1, label: "1 hour" },
];

export function StudentsSettings({ campuses, canEdit }: { campuses: Pick<Campus, "id" | "name">[]; canEdit: boolean }) {
  const [s, setS] = useState<Summary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [n, setN] = useState<Notif | null>(null);
  const [savedN, setSavedN] = useState<Notif | null>(null);
  const [nMsg, setNMsg] = useState<string | null>(null);
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const emails = (t: string) => t.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

  const load = () => callApi<Summary>("GET", "/students/summary").then(setS).catch(() => setS(null));
  useEffect(() => {
    void load();
    callApi<Notif>("GET", "/notification-settings").then((x) => {
      setN(x); setSavedN(x); setToText(x.report.to.join(", ")); setCcText(x.report.cc.join(", "));
    }).catch(() => {});
  }, []);

  async function sync() {
    setSyncing(true); setMsg(null);
    try {
      const r = await callApi<{ total: number; imported: number; deactivated: number }>("POST", "/students/sync");
      setMsg({ ok: true, text: `Synced ${r.total.toLocaleString("en-IN")} students (${r.imported} new${r.deactivated ? `, ${r.deactivated} no longer active` : ""}).` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  async function map(code: string, campusId: string) {
    try {
      await callApi("PUT", "/students/campus-map", { code, campusId: campusId || null });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't change the campus" });
    }
  }

  async function saveN() {
    if (!n) return;
    try {
      const r = await callApi<Notif>("PUT", "/notification-settings", { ...n, report: { ...n.report, to: emails(toText), cc: emails(ccText) } });
      setN(r); setSavedN(r); setToText(r.report.to.join(", ")); setCcText(r.report.cc.join(", ")); setNMsg("Saved");
    } catch (e) {
      setNMsg(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Student list"
          description="Imported from the student database every month: name, email, campus, batch and program. Used to email students about new events."
          action={canEdit && s?.connected ? (
            <Button size="sm" onClick={() => void sync()} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{syncing ? "Syncing…" : "Sync now"}
            </Button>
          ) : undefined}
        />
        <CardBody className="space-y-5">
          {!s ? <p className="text-sm text-muted">Loading…</p> : (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><strong>{s.total.toLocaleString("en-IN")}</strong> active students{s.faculty ? <> · <strong>{s.faculty}</strong> ALTA instructors</> : null}</span>
                <span className="text-muted">{s.lastSyncAt ? `Last synced ${new Date(s.lastSyncAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · next sync in about a month` : "Not synced yet"}</span>
                {!s.connected && <span className="text-amber-700">Student database not connected</span>}
              </div>
              {msg && <p className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>}

              {s.campuses.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">In the student database</th><th className="py-2 pr-3">Students</th><th className="py-2">Campus on this site</th></tr></thead>
                    <tbody>
                      {s.campuses.map((c) => (
                        <tr key={`${c.campusId}-${c.codes.join()}`} className="border-t border-border">
                          <td className="py-2 pr-3"><span className="font-medium">{c.campusId ? c.name : c.name}</span><span className="ml-2 font-mono text-xs text-muted">{c.codes.join(", ")}</span></td>
                          <td className="py-2 pr-3">{c.students}</td>
                          <td className="py-2">
                            {canEdit ? (
                              <Select value={c.campusId ?? ""} onChange={(e) => c.codes.forEach((code) => void map(code, e.target.value))} className="h-9 w-64 text-sm">
                                <option value="">Not on this site (all-campus events only)</option>
                                {campuses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                              </Select>
                            ) : (c.campusId ? c.name : "Not on this site")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s.batches.length > 0 && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="text-muted">Batches:</span>
                  {s.batches.map((b) => <span key={b.batch} className="rounded-full bg-bg px-2.5 py-0.5">{b.batch} · {b.students}</span>)}
                  <span className="ml-2 text-muted">Programs:</span>
                  {s.programs.map((p) => <span key={p.program} className="rounded-full bg-bg px-2.5 py-0.5">{p.program} · {p.students}</span>)}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Event emails" description="Applies to every event: central and campus." />
        <CardBody className="space-y-5">
          {!n ? <p className="text-sm text-muted">Loading…</p> : (
            <>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4 text-primary" />Remind registered students before the event</p>
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_OPTIONS.map((o) => {
                    const on = n.reminderHours.includes(o.h);
                    return (
                      <button
                        key={o.h} type="button" disabled={!canEdit}
                        onClick={() => setN({ ...n, reminderHours: on ? n.reminderHours.filter((x) => x !== o.h) : [...n.reminderHours, o.h] })}
                        className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", on ? "border-primary bg-primary text-primary-fg" : "border-border bg-card hover:border-primary/50")}
                      >{o.label} before</button>
                    );
                  })}
                </div>
                {!n.reminderHours.length && <p className="mt-2 text-xs text-amber-700">No reminders will be sent.</p>}
              </div>
              <div className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm font-medium">After every event</p>
                <p className="text-xs text-muted">About 2 hours after an event ends, participants get a feedback email. Then the outcome report (AI summary, numbers, feedback, social media links and the PDF) is emailed to:</p>
                <label className="block text-sm">To
                  <input
                    disabled={!canEdit} value={toText}
                    onChange={(e) => { setToText(e.target.value); setNMsg(null); }}
                    className="mt-1 h-10 w-full rounded-brand border border-border bg-card px-3 text-sm" placeholder="ceo@example.com"
                  />
                </label>
                <label className="block text-sm">CC
                  <input
                    disabled={!canEdit} value={ccText}
                    onChange={(e) => { setCcText(e.target.value); setNMsg(null); }}
                    className="mt-1 h-10 w-full rounded-brand border border-border bg-card px-3 text-sm" placeholder="team@example.com, lead@example.com"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">Send the report
                  <Select disabled={!canEdit} value={n.report.afterDays} onChange={(e) => setN({ ...n, report: { ...n.report, afterDays: Number(e.target.value) } })} className="h-9 w-40 text-sm">
                    {[2, 3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} days</option>)}
                  </Select>
                  after the event ends
                </label>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" disabled={!canEdit} checked={n.announceByDefault} onChange={(e) => setN({ ...n, announceByDefault: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
                <span><span className="font-medium">New events email their audience by default</span><span className="block text-xs text-muted">The &ldquo;Email this audience when the event is announced&rdquo; box starts ticked. It can still be unticked per event.</span></span>
              </label>
              {canEdit && (
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={() => void saveN()} disabled={JSON.stringify({ ...n, report: { ...n.report, to: emails(toText), cc: emails(ccText) } }) === JSON.stringify(savedN)}>Save</Button>
                  {nMsg && <span className="text-sm text-muted">{nMsg}</span>}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
