import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { fmtDateTime, fmtRange, humanize, typeLabel } from "@/lib/format";
import type { ElevateEvent, EventSession, Guest, GuestDocument, GuestProfile, Task, User } from "@/lib/types";
import { PrintButton } from "@/components/client/misc";
import { GuestAvatar } from "@/components/guest-avatar";

export const metadata: Metadata = { title: "Guest brief" };

type Props = { params: Promise<{ id: string; guestId: string }> };

interface Brief {
  guest?: Guest; profile?: GuestProfile | null; event?: ElevateEvent; sessions?: EventSession[];
  host?: (Partial<User> & { name: string }) | null; tasks?: Task[]; documents?: GuestDocument[];
}

export default async function GuestBriefPage({ params }: Props) {
  const { id, guestId } = await params;
  const tenant = await requireTenant();
  const raw = await apiGet<Brief & Partial<Guest>>(`/guests/${guestId}/brief`);
  if (!raw) notFound();
  const g = (raw.guest ?? raw) as Guest;
  const event = raw.event ?? g.event ?? (await apiGet<ElevateEvent>(`/events/${id}`));
  const profile = raw.profile ?? g.profile ?? null;
  const host = raw.host ?? g.host ?? null;
  const sessions = raw.sessions ?? event?.sessions ?? [];
  const docs = raw.documents ?? (Array.isArray(g.documents) ? g.documents : []);
  const tasks = raw.tasks ?? [];
  const consent = g.consentRecording === true ? "Yes" : g.consentRecording === false ? "No — do not record or post" : "Not asked yet";

  return (
    <div className="mx-auto max-w-3xl bg-white text-slate-900 print:max-w-none">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/admin/events/${id}?tab=guests&guest=${guestId}`} className="text-sm text-muted hover:text-fg">← Guest file</Link>
        <PrintButton />
      </div>

      <article className="space-y-6 rounded-brand border border-border p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{tenant.name} · Guest brief</p>
            <h1 className="mt-1 text-2xl font-bold">{g.name}</h1>
            <p className="text-slate-600">{[g.designation, g.organization].filter(Boolean).join(", ")}</p>
            <p className="mt-1 text-sm">{humanize(g.role ?? "SPEAKER")} · Status: {humanize(g.status ?? "PROPOSED")}</p>
          </div>
          <GuestAvatar guest={g} size="h-24 w-24" />
        </header>

        {event && (
          <Section title="Event">
            <Row label="Event" value={`${event.title} (${typeLabel(event.type)})`} />
            <Row label="When" value={fmtRange(event.startsAt, event.endsAt)} />
            <Row label="Where" value={[event.venue, event.mode !== "OFFLINE" ? event.meetingUrl : null].filter(Boolean).join(" · ") || "—"} />
          </Section>
        )}

        <Section title="Session">
          <Row label="Talk" value={g.talkTitle ?? "—"} />
          <Row label="Time" value={g.sessionAt ? fmtDateTime(g.sessionAt) : "—"} />
          {g.talkAbstract && <Row label="Abstract" value={g.talkAbstract} />}
          <Row label="AV needs" value={g.avRequirements ?? "—"} />
          <Row label="Recording consent" value={consent} />
        </Section>

        <Section title="Contact & host">
          <Row label="Guest phone" value={g.phone ?? "—"} />
          <Row label="Guest email" value={g.email ?? "—"} />
          <Row label="Our host" value={host ? [host.name, host.email, (host as { phone?: string | null }).phone].filter(Boolean).join(" · ") : "Not assigned"} />
        </Section>

        <Section title="Logistics">
          <Row label="Arrival" value={g.arrivalAt ? fmtDateTime(g.arrivalAt) : "—"} />
          <Row label="Departure" value={g.departureAt ? fmtDateTime(g.departureAt) : "—"} />
          <Row label="Travel" value={g.travelNotes ?? "—"} />
          <Row label="Stay" value={g.stayDetails ?? "—"} />
          <Row label="Dietary" value={g.dietary ?? "—"} />
        </Section>

        <Section title="Courtesy & payment">
          <Row label="Honorarium" value={g.honorarium != null ? `₹${Number(g.honorarium).toLocaleString("en-IN")} · ${humanize(g.paymentStatus ?? "PENDING")}` : "—"} />
          <Row label="Memento" value={g.mementoGiven ? "Given" : "To be given"} />
          <Row label="Thank-you" value={g.thankYouSentAt ? `Sent ${fmtDateTime(g.thankYouSentAt)}` : "Not sent"} />
        </Section>

        {(g.bio || profile?.bio) && (
          <Section title="Introduction (for the anchor)">
            <p className="whitespace-pre-line text-sm leading-relaxed">{g.bio ?? profile?.bio}</p>
          </Section>
        )}

        {sessions.length > 0 && (
          <Section title="Event agenda">
            <ul className="space-y-1 text-sm">
              {sessions.map((s) => <li key={s.id}><span className="font-medium">{fmtDateTime(s.startsAt)}</span> — {s.title}{s.speaker ? ` (${s.speaker})` : ""}</li>)}
            </ul>
          </Section>
        )}

        {tasks.length > 0 && (
          <Section title="Related checklist items">
            <ul className="space-y-1 text-sm">
              {tasks.map((t) => <li key={t.id}>{t.status === "DONE" ? "☑" : "☐"} {t.title}{t.dueAt ? ` · due ${fmtDateTime(t.dueAt)}` : ""}</li>)}
            </ul>
          </Section>
        )}

        {docs.length > 0 && (
          <Section title="Documents">
            <ul className="space-y-1 text-sm">
              {docs.map((d, i) => <li key={i}><a href={d.url} className="text-primary underline">{d.name}</a>{d.kind ? ` — ${humanize(d.kind)}` : ""}</li>)}
            </ul>
          </Section>
        )}

        {profile?.notes && (
          <Section title="Internal notes">
            <p className="whitespace-pre-line text-sm">{profile.notes}</p>
          </Section>
        )}

        <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500">Generated {fmtDateTime(new Date())} · Internal document, do not share.</footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  );
}
