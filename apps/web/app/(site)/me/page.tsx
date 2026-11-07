import type { Metadata } from "next";
import Link from "next/link";
import { Award, Bell, CreditCard, Download, Linkedin, Ticket, Users } from "lucide-react";
import { formatMoney } from "@elevate/shared";
import { PaymentStatusBadge } from "@/components/payment-status";
import { apiList } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getHost, requireTenant } from "@/lib/tenant";
import { fmtDate, fmtDateTime, fmtRange, humanize } from "@/lib/format";
import type { AppNotification, Certificate, LinkedInPost, Payment, Registration, Team } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, LinkButton, Select, StatusBadge, Textarea } from "@/components/ui";
import { ApiForm } from "@/components/client/api-form";
import { ApiButton } from "@/components/client/api-button";
import { LinkedInDraft } from "./linkedin-draft";

export const metadata: Metadata = { title: "My space" };

export default async function MePage() {
  const me = await requireUser("/me");
  const tenant = await requireTenant();
  const host = await getHost();
  const origin = `${/^(localhost|127\.|[a-z0-9-]+\.localhost)/.test(host) ? "http" : "https"}://${host}`;
  const [regs, teams, certs, posts, notifications, myPayments] = await Promise.all([
    apiList<Registration>("/me/registrations"),
    apiList<Team>("/me/teams"),
    apiList<Certificate>("/me/certificates"),
    apiList<LinkedInPost>("/me/linkedin"),
    apiList<AppNotification>("/me/notifications"),
    apiList<Payment>("/me/payments"),
  ]);
  // Payments: /me/payments when available, otherwise the payments attached to my registrations.
  const paymentMap = new Map<string, Payment>();
  for (const p of myPayments) paymentMap.set(p.id, p);
  for (const r of regs) if (r.payment && !paymentMap.has(r.payment.id)) paymentMap.set(r.payment.id, { ...r.payment, event: r.payment.event ?? r.event ?? null });
  const payments = [...paymentMap.values()].sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
  const sortedNotes = notifications.slice().sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || +new Date(b.createdAt) - +new Date(a.createdAt));
  const unread = notifications.filter((n) => !n.readAt).length;
  const active = regs.filter((r) => r.status !== "CANCELLED");
  const upcoming = active.filter((r) => r.event && !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(r.event.status));
  const past = active.filter((r) => r.event && ["COMPLETED", "ARCHIVED"].includes(r.event.status));

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-3xl font-bold">{me.user.name}</h1>
          <p className="text-sm text-muted">{me.user.email}{me.membership?.campus ? ` · ${me.membership.campus.name}` : ""}</p>
        </div>
        <form action="/api/auth/logout" method="post"><Button variant="outline" size="sm">Sign out</Button></form>
      </div>

      {notifications.length > 0 && (
        <section id="notifications" className="scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold"><span className="text-primary"><Bell className="h-5 w-5" /></span>Notifications{unread > 0 && <Badge tone="red">{unread} new</Badge>}</h2>
            {unread > 0 && <ApiButton path="/me/notifications/read" body={{}} size="sm" variant="outline">Mark all read</ApiButton>}
          </div>
          <Card>
            <ul className="divide-y divide-border">
              {sortedNotes.slice(0, 15).map((n) => {
                const link = n.ctaUrl ?? (typeof n.data?.url === "string" ? (n.data.url as string) : undefined) ?? (n.event?.slug ? `/events/${n.event.slug}` : undefined);
                return (
                  <li key={n.id} className={`flex gap-3 px-5 py-3 ${n.readAt ? "" : "bg-primary/5"}`}>
                    <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.subject}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted">{n.body}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>{fmtDateTime(n.createdAt)}</span>
                        {link && <a href={link} className="font-medium text-primary hover:underline">{n.ctaLabel ?? "Open"}</a>}
                        {!n.readAt && <ApiButton path="/me/notifications/read" body={{ ids: [n.id] }} size="sm" variant="ghost" className="h-6 px-2 text-xs">Mark read</ApiButton>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle icon={<Ticket className="h-5 w-5" />} title="My tickets" />
        {upcoming.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map((r) => (
              <Card key={r.id} className="flex gap-4 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/proxy/registrations/${r.ticketCode}/qr.png`} alt="QR ticket" className="h-28 w-28 shrink-0 rounded-lg border border-border bg-white p-1" />
                <div className="min-w-0 space-y-1">
                  <Link href={`/events/${r.event!.slug}`} className="font-semibold hover:text-primary">{r.event!.title}</Link>
                  <p className="text-xs text-muted">{fmtRange(r.event!.startsAt, r.event!.endsAt)}</p>
                  <StatusBadge status={r.status} />
                  <p className="font-mono text-[11px] text-muted">{r.ticketCode}</p>
                  {r.status === "PENDING_PAYMENT" && <Link href={`/events/${r.event!.slug}/register`} className="block text-xs font-medium text-primary hover:underline">Complete payment →</Link>}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No upcoming tickets" description="Register for an event and your QR ticket will appear here." action={<LinkButton href="/events" size="sm">Browse events</LinkButton>} />
        )}
      </section>

      {teams.length > 0 && (
        <section>
          <SectionTitle icon={<Users className="h-5 w-5" />} title="My teams" />
          <div className="grid gap-4 sm:grid-cols-2">
            {teams.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{t.name}</p>
                  <span className="flex gap-1">
                    {(t.payment?.status ?? t.paymentStatus) && <PaymentStatusBadge status={(t.payment?.status ?? t.paymentStatus)!} />}
                    {t.award ? <Badge tone="amber">{humanize(t.award)}</Badge> : t.submittedAt ? <Badge tone="green">Submitted</Badge> : <Badge>Draft</Badge>}
                  </span>
                </div>
                {t.event && <Link href={`/events/${t.event.slug}`} className="text-sm text-primary hover:underline">{t.event.title}</Link>}
                <p className="mt-2 text-xs text-muted">{(t.members ?? []).map((m) => m.user?.name + (m.isLeader ? " (leader)" : "")).filter(Boolean).join(", ")}</p>
                {t.event && <LinkButton href={`/events/${t.event.slug}/team`} size="sm" variant="outline" className="mt-3">Team page</LinkButton>}
              </Card>
            ))}
          </div>
        </section>
      )}

      {payments.length > 0 && (
        <section>
          <SectionTitle icon={<CreditCard className="h-5 w-5" />} title="Payments" />
          <Card>
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.event?.title ?? "Event registration"}{p.team?.name ? <span className="font-normal text-muted"> · {p.team.name}</span> : null}</p>
                    <p className="text-xs text-muted">{p.receiptNo ? <span className="font-mono">{p.receiptNo}</span> : null}{p.paidAt ? ` · paid ${fmtDateTime(p.paidAt)}` : p.createdAt ? ` · ${fmtDateTime(p.createdAt)}` : ""}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency ?? "INR")}</span>
                  <PaymentStatusBadge status={p.status} />
                  {(p.status === "PAID" || p.status === "REFUNDED") && <LinkButton href={`/api/proxy/payments/${p.id}/receipt.pdf`} external size="sm" variant="ghost"><Download className="h-4 w-4" />Receipt</LinkButton>}
                  {["CREATED", "FAILED", "EXPIRED"].includes(p.status) && p.event?.slug && <LinkButton href={`/events/${p.event.slug}/register`} size="sm">Pay now</LinkButton>}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle icon={<Award className="h-5 w-5" />} title="My certificates" />
        {certs.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {certs.map((c) => {
              const issued = new Date(c.issuedAt);
              const certUrl = `${origin}/verify/${c.serial}`;
              const addUrl = `https://www.linkedin.com/profile/add?${new URLSearchParams({
                startTask: "CERTIFICATION_NAME",
                name: `${humanize(c.type)} — ${c.event?.title ?? "Event"}`,
                organizationName: tenant.name,
                issueYear: String(issued.getFullYear()),
                issueMonth: String(issued.getMonth() + 1),
                certUrl,
                certId: c.serial,
              })}`;
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge tone="amber">{humanize(c.type)}</Badge>
                      <p className="mt-2 font-semibold">{c.event?.title}</p>
                      {c.detail && <p className="text-sm text-muted">{c.detail}</p>}
                      <p className="mt-1 text-xs text-muted">Issued {fmtDate(c.issuedAt)} · <span className="font-mono">{c.serial}</span></p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <LinkButton href={`/api/proxy/certificates/${c.serial}.pdf`} external size="sm"><Download className="h-4 w-4" />Download PDF</LinkButton>
                    <LinkButton href={addUrl} external size="sm" variant="outline"><Linkedin className="h-4 w-4" />Add to LinkedIn</LinkButton>
                    <LinkButton href={`/verify/${c.serial}`} size="sm" variant="ghost">Verify</LinkButton>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No certificates yet" description="Certificates are issued automatically after events you attend." />
        )}
      </section>

      {posts.length > 0 && (
        <section>
          <SectionTitle icon={<Linkedin className="h-5 w-5" />} title="Share your achievement on LinkedIn" />
          <p className="-mt-2 mb-4 text-sm text-muted">We drafted a post for you. Edit it, share it, then paste your post link so we can celebrate you.</p>
          <div className="space-y-4">{posts.map((p) => <LinkedInDraft key={p.id} post={p} />)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionTitle title="Past events — tell us how it went" />
          <div className="grid gap-4 sm:grid-cols-2">
            {past.map((r) => (
              <Card key={r.id}>
                <CardHeader title={r.event!.title} description={fmtDate(r.event!.startsAt)} />
                <CardBody>
                  <ApiForm path={`/events/${r.eventId}/feedback`} className="space-y-3" successMessage="Thanks for your feedback!">
                    <div className="grid grid-cols-2 gap-3">
                      <Select name="rating:number" required defaultValue="">
                        <option value="" disabled>Rating</option>
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                      </Select>
                      <Input name="nps:number" type="number" min={0} max={10} placeholder="Recommend? 0–10" />
                    </div>
                    <Textarea name="comment" placeholder="What did you like? What could be better?" />
                    <Button type="submit" size="sm">Send feedback</Button>
                  </ApiForm>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">{icon && <span className="text-primary">{icon}</span>}{title}</h2>;
}
