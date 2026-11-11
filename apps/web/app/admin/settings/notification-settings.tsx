"use client";

import { useEffect, useState } from "react";
import { BellRing, ClipboardList, FileBarChart, Megaphone, MessageSquareHeart } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Card, CardBody, CardHeader, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";

type Settings = {
  reminderHours: number[]; announceByDefault: boolean;
  report: { to: string[]; cc: string[]; afterDays: number };
  feedbackAfterHours: number; registerNudgeHours: number[]; taskDigest: boolean;
  weekly: { enabled: boolean; weekday: number; hour: number };
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const REMINDERS = [{ h: 168, label: "1 week" }, { h: 72, label: "3 days" }, { h: 24, label: "1 day" }, { h: 3, label: "3 hours" }, { h: 1, label: "1 hour" }];
const NUDGES = [{ h: 168, label: "1 week" }, { h: 72, label: "3 days" }, { h: 24, label: "1 day" }, { h: 6, label: "6 hours" }];
const emails = (t: string) => t.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

function Chips({ options, value, onChange, disabled }: { options: { h: number; label: string }[]; value: number[]; onChange: (v: number[]) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.h);
        return (
          <button key={o.h} type="button" disabled={disabled} onClick={() => onChange(on ? value.filter((x) => x !== o.h) : [...value, o.h])}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", on ? "border-primary bg-primary text-primary-fg" : "border-border bg-card hover:border-primary/50")}>
            {o.label} before
          </button>
        );
      })}
    </div>
  );
}

function Section({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-border py-5 first:pt-0 last:border-0 last:pb-0 md:grid-cols-[260px_1fr]">
      <div>
        <p className="flex items-center gap-2 font-semibold">{icon}{title}</p>
        <p className="mt-1 text-xs text-muted">{text}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** Every automatic email in one place (brand admins and the super admin can change it). Applies to all events. */
export function NotificationSettings({ canEdit }: { canEdit: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = (x: Settings) => ({ ...x, report: { ...x.report, to: emails(toText), cc: emails(ccText) } });
  useEffect(() => {
    callApi<Settings>("GET", "/notification-settings").then((x) => {
      setS(x); setToText(x.report.to.join(", ")); setCcText(x.report.cc.join(", ")); setSaved(JSON.stringify(x));
    }).catch(() => setMsg({ ok: false, text: "Couldn't load the settings" }));
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true); setMsg(null);
    try {
      const r = await callApi<Settings>("PUT", "/notification-settings", payload(s));
      setS(r); setToText(r.report.to.join(", ")); setCcText(r.report.cc.join(", ")); setSaved(JSON.stringify(r));
      setMsg({ ok: true, text: "Saved. Applies to all events from now on." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <Card><CardBody><p className="text-sm text-muted">{msg?.text ?? "Loading…"}</p></CardBody></Card>;
  const dirty = JSON.stringify(payload(s)) !== saved;
  const off = !canEdit;

  return (
    <Card>
      <CardHeader title="Automatic emails" description="One place for every automatic email, for all events: central and campus. Changes apply from the next email onwards." />
      <CardBody>
        <Section icon={<Megaphone className="h-4 w-4 text-primary" />} title="New events" text="When an event goes public and its “Email this audience” box is ticked, its audience gets “New event, register now”.">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" disabled={off} checked={s.announceByDefault} onChange={(e) => setS({ ...s, announceByDefault: e.target.checked })} className="mt-0.5 accent-[rgb(var(--primary))]" />
            <span><span className="font-medium">Tick “Email this audience” on new events by default</span><span className="block text-xs text-muted">Off: organisers tick it per event when they want the email to go out.</span></span>
          </label>
          <div>
            <p className="mb-2 text-sm font-medium">“Registration closes soon” to students who haven&rsquo;t registered</p>
            <Chips options={NUDGES} value={s.registerNudgeHours} onChange={(v) => setS({ ...s, registerNudgeHours: v })} disabled={off} />
            <p className="mt-1 text-xs text-muted">{s.registerNudgeHours.length ? "Before registration closes (or the event starts). Only for events whose announcement email was sent." : "Off: no follow-up emails."}</p>
          </div>
        </Section>

        <Section icon={<BellRing className="h-4 w-4 text-primary" />} title="Reminders" text="To registered people, with the venue or the joining link (online events get a “Join now” button).">
          <Chips options={REMINDERS} value={s.reminderHours} onChange={(v) => setS({ ...s, reminderHours: v })} disabled={off} />
          {!s.reminderHours.length && <p className="text-xs text-amber-700">No reminders will be sent.</p>}
        </Section>

        <Section icon={<MessageSquareHeart className="h-4 w-4 text-primary" />} title="Feedback" text="“How was it?” to everyone who attended (or registered, if attendance wasn't taken).">
          <label className="flex flex-wrap items-center gap-2 text-sm">Send it
            <span className="inline-block w-36">
              <Select disabled={off} value={s.feedbackAfterHours} onChange={(e) => setS({ ...s, feedbackAfterHours: Number(e.target.value) })} className="h-9 text-sm">
                {[1, 2, 6, 12, 24].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>)}
              </Select>
            </span>
            after the event ends
          </label>
        </Section>

        <Section icon={<FileBarChart className="h-4 w-4 text-primary" />} title="Outcome report" text="AI summary, numbers, what participants said, social media links and the PDF report.">
          <label className="block text-sm">To
            <input disabled={off} value={toText} onChange={(e) => setToText(e.target.value)} className="mt-1 h-10 w-full rounded-brand border border-border bg-card px-3 text-sm" placeholder="ceo@example.com" />
          </label>
          <label className="block text-sm">CC
            <input disabled={off} value={ccText} onChange={(e) => setCcText(e.target.value)} className="mt-1 h-10 w-full rounded-brand border border-border bg-card px-3 text-sm" placeholder="team@example.com, lead@example.com" />
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm">Send it
            <span className="inline-block w-36">
              <Select disabled={off} value={s.report.afterDays} onChange={(e) => setS({ ...s, report: { ...s.report, afterDays: Number(e.target.value) } })} className="h-9 text-sm">
                {[1, 2, 3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
              </Select>
            </span>
            after the event ends
          </label>
        </Section>

        <Section icon={<FileBarChart className="h-4 w-4 text-primary" />} title="Weekly report" text="Every week to the same To and CC as the outcome report: last week's events, what's coming up, campus comparison and what needs attention, with a PDF.">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" disabled={off} checked={s.weekly.enabled} onChange={(e) => setS({ ...s, weekly: { ...s.weekly, enabled: e.target.checked } })} className="accent-[rgb(var(--primary))]" />
            Send the weekly report
          </label>
          {s.weekly.enabled && (
            <label className="flex flex-wrap items-center gap-2 text-sm">Every
              <span className="inline-block w-36">
                <Select disabled={off} value={s.weekly.weekday} onChange={(e) => setS({ ...s, weekly: { ...s.weekly, weekday: Number(e.target.value) } })} className="h-9 text-sm">
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </Select>
              </span>
              at
              <span className="inline-block w-28">
                <Select disabled={off} value={s.weekly.hour} onChange={(e) => setS({ ...s, weekly: { ...s.weekly, hour: Number(e.target.value) } })} className="h-9 text-sm">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`}</option>)}
                </Select>
              </span>
              India time
            </label>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            <a href="/api/proxy/reports/weekly.pdf" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">Preview this week&rsquo;s PDF ↗</a>
            {canEdit && (
              <button type="button" className="font-semibold text-primary hover:underline" onClick={async () => {
                if (!window.confirm("Email the weekly report to the report recipients now?")) return;
                try { await callApi("POST", "/reports/weekly/send"); setMsg({ ok: true, text: "Weekly report sent." }); }
                catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send" }); }
              }}>Send it now</button>
            )}
          </div>
        </Section>

        <Section icon={<ClipboardList className="h-4 w-4 text-primary" />} title="Team tasks" text="A daily email to people with overdue checklist tasks (with their team leads).">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" disabled={off} checked={s.taskDigest} onChange={(e) => setS({ ...s, taskDigest: e.target.checked })} className="accent-[rgb(var(--primary))]" />
            Send the daily overdue-tasks email
          </label>
        </Section>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={() => void save()} disabled={busy || !dirty}>{busy ? "Saving…" : "Save"}</Button>
            {msg && <span className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</span>}
          </div>
        ) : <p className="border-t border-border pt-4 text-sm text-muted">Only brand admins can change these.</p>}
      </CardBody>
    </Card>
  );
}
