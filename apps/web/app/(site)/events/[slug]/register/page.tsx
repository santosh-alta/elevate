import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { eventFee, fmtDateTime, fmtRange } from "@/lib/format";
import type { ElevateEvent, Payment, ProblemStatement, Registration } from "@/lib/types";
import { Card, CardBody, EmptyState, LinkButton } from "@/components/ui";
import { PriceTag } from "@/components/event-extras";
import { PaymentPanel } from "@/components/client/payment-panel";
import { RegisterForm } from "./register-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await apiGet<ElevateEvent>(`/events/${encodeURIComponent(slug)}`);
  return { title: e ? `Register · ${e.title}` : "Register", robots: { index: false } };
}

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params;
  const me = await requireUser(`/events/${slug}/register`);
  const event = await apiGet<ElevateEvent>(`/events/${encodeURIComponent(slug)}`);
  if (!event) notFound();
  const regs = await apiList<Registration>("/me/registrations");
  const reg = regs.find((r) => r.eventId === event.id && r.status !== "CANCELLED");
  const fee = eventFee(event);
  const config = event.config ?? {};
  const teamMode = !!event.modules?.teams && config.teamRegistration !== "JOIN_LATER";
  const problems: ProblemStatement[] = (event.problemStatements ?? []).filter((p) => !p.releaseAt || new Date(p.releaseAt).getTime() <= Date.now());

  // Registered already (and paid, or free): go straight to the confirmation.
  if (reg && reg.status !== "PENDING_PAYMENT") redirect(`/events/${slug}/register/success`);

  // Pending payment: resume it instead of registering again.
  let pending: Payment | null = null;
  if (reg?.status === "PENDING_PAYMENT") {
    const id = event.myPayment?.id ?? reg.paymentId ?? reg.payment?.id;
    pending = id ? (await apiGet<Payment>(`/payments/${id}`)) ?? event.myPayment ?? reg.payment ?? null : event.myPayment ?? null;
  }

  const open = event.status === "REGISTRATION_OPEN";
  const questions = Array.isArray(event.registrationForm) ? event.registrationForm : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/events/${event.slug}`} className="text-sm text-muted hover:text-fg">← {event.title}</Link>
      <h1 className="mt-2 text-3xl font-bold">{teamMode ? "Register your team" : "Register"}</h1>
      <Card className="mt-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{event.title}</p>
            <p className="flex items-center gap-1.5 text-muted"><CalendarDays className="h-4 w-4" />{fmtRange(event.startsAt, event.endsAt)}</p>
            {(event.venue || event.mode !== "OFFLINE") && <p className="flex items-center gap-1.5 text-muted"><MapPin className="h-4 w-4" />{event.venue ?? "Online"}</p>}
          </div>
          <PriceTag event={event} />
        </CardBody>
      </Card>

      <div className="mt-6">
        {pending && ["CREATED", "FAILED", "EXPIRED"].includes(pending.status) ? (
          <PaymentPanel initial={pending} successHref={`/events/${event.slug}/register/success`} title="Your registration is waiting for payment" />
        ) : pending?.status === "PAID" ? (
          <EmptyState title="Payment received" description="We're confirming your seat." action={<LinkButton href={`/events/${event.slug}/register/success?payment=${pending.id}`}>See confirmation</LinkButton>} />
        ) : !open ? (
          <EmptyState
            title={["DRAFT", "PLANNING", "ANNOUNCED"].includes(event.status) ? "Registrations are not open yet" : "Registrations are closed"}
            description={event.registrationOpensAt && new Date(event.registrationOpensAt).getTime() > Date.now() ? `Registrations open ${fmtDateTime(event.registrationOpensAt)}.` : undefined}
            action={<LinkButton href={`/events/${event.slug}`} variant="outline">Back to event</LinkButton>}
          />
        ) : (
          <RegisterForm
            eventId={event.id} slug={event.slug} user={me.user} questions={questions}
            teamMode={teamMode}
            minSize={Math.max(1, Number(config.minTeamSize) || 1)}
            maxSize={Math.max(Number(config.minTeamSize) || 1, Number(config.maxTeamSize) || 4)}
            tracks={config.tracks ?? []} problems={problems} fee={fee && fee.amount > 0 ? fee : null}
            requiresApproval={event.requiresApproval}
          />
        )}
      </div>
    </div>
  );
}
