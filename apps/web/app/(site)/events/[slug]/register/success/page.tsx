import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Download, Users } from "lucide-react";
import { formatMoney } from "@elevate/shared";
import { apiGet, apiList } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, fmtRange } from "@/lib/format";
import type { ElevateEvent, Payment, Registration } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader, LinkButton, StatusBadge } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/payment-status";

export const metadata: Metadata = { title: "You're registered", robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ payment?: string }> };

export default async function RegisterSuccessPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { payment: paymentId } = await searchParams;
  await requireUser(`/events/${slug}/register/success`);
  const event = await apiGet<ElevateEvent>(`/events/${encodeURIComponent(slug)}`);
  if (!event) notFound();
  const [regs, payment] = await Promise.all([
    apiList<Registration>("/me/registrations"),
    paymentId ? apiGet<Payment>(`/payments/${encodeURIComponent(paymentId)}`) : Promise.resolve(event.myPayment ?? null),
  ]);
  const reg = regs.find((r) => r.eventId === event.id && r.status !== "CANCELLED");
  const team = event.myTeam ?? null;
  const pending = reg?.status === "PENDING_PAYMENT" || payment?.status === "CREATED";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="text-center">
        {pending ? <Clock className="mx-auto h-14 w-14 text-amber-500" /> : <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />}
        <h1 className="mt-3 text-3xl font-bold">{pending ? "Confirming your payment…" : reg?.status === "WAITLISTED" ? "You're on the waitlist" : reg?.status === "REGISTERED" && event.requiresApproval ? "Registration received" : "You're registered!"}</h1>
        <p className="mt-1 text-muted">{event.title} · {fmtRange(event.startsAt, event.endsAt)}</p>
        {pending && <p className="mx-auto mt-2 max-w-md text-sm text-muted">This usually takes a few seconds. Refresh this page in a moment — we&apos;ll also email you once it&apos;s confirmed.</p>}
        {!pending && <p className="mt-2 text-sm text-muted">A confirmation email with your ticket is on its way{team && (team.members?.length ?? 0) > 1 ? ", and your teammates have been emailed too" : ""}.</p>}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {reg && (
          <Card>
            <CardHeader title="Your ticket" action={<StatusBadge status={reg.status} />} />
            <CardBody className="space-y-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/proxy/registrations/${reg.ticketCode}/qr.png`} alt="Ticket QR code" className="mx-auto h-44 w-44 rounded-lg border border-border bg-white p-2" />
              <p className="font-mono text-xs text-muted">{reg.ticketCode}</p>
              <p className="text-xs text-muted">Show this QR code at check-in. It&apos;s also in My space and the app.</p>
            </CardBody>
          </Card>
        )}
        <div className="space-y-6">
          {payment && (
            <Card>
              <CardHeader title="Payment" action={<PaymentStatusBadge status={payment.status} />} />
              <CardBody className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Amount</span><span className="font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency ?? "INR")}</span></div>
                {payment.receiptNo && <div className="flex justify-between"><span className="text-muted">Receipt no.</span><span className="font-mono">{payment.receiptNo}</span></div>}
                {payment.paidAt && <div className="flex justify-between"><span className="text-muted">Paid</span><span>{fmtDateTime(payment.paidAt)}</span></div>}
                {payment.status === "PAID" && (
                  <LinkButton href={`/api/proxy/payments/${payment.id}/receipt.pdf`} external variant="outline" size="sm" className="mt-2 w-full"><Download className="h-4 w-4" />Download receipt (PDF)</LinkButton>
                )}
              </CardBody>
            </Card>
          )}
          {team && (
            <Card>
              <CardHeader title={team.name} description="Your team" action={<Users className="h-5 w-5 text-muted" />} />
              <CardBody className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {(team.members ?? []).map((m) => (
                    <li key={m.userId} className="flex justify-between gap-2"><span className="truncate">{m.user?.name ?? m.user?.email}</span>{m.isLeader && <Badge tone="primary">Leader</Badge>}</li>
                  ))}
                </ul>
                <LinkButton href={`/events/${event.slug}/team`} size="sm" className="w-full">Open team page</LinkButton>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <LinkButton href={`/events/${event.slug}`} variant="outline">Back to event</LinkButton>
        <LinkButton href="/me" variant="ghost">My space</LinkButton>
        {pending && <Link href={`/events/${event.slug}/register/success${paymentId ? `?payment=${paymentId}` : ""}`} className="self-center text-sm text-primary hover:underline">Refresh</Link>}
      </div>
    </div>
  );
}
