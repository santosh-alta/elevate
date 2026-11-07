import Link from "next/link";
import { Download, FileText, IndianRupee, Ticket, Trash2 } from "lucide-react";
import { apiList } from "@/lib/api";
import { formatMoney } from "@elevate/shared";
import { eventFee, fmtDateTime, money } from "@/lib/format";
import type { Coupon, ElevateEvent, Payment } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, Stat, Table, Td, Th } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/payment-status";
import { cn } from "@/components/ui/cn";
import { ApiButton } from "@/components/client/api-button";
import { CouponForm } from "@/components/admin/coupon-form";

const PAYMENT_LABELS: Record<string, string> = { CREATED: "Pending", PAID: "Paid", FAILED: "Failed", EXPIRED: "Expired", REFUNDED: "Refunded" };
const FILTERS = ["", "PAID", "CREATED", "FAILED", "EXPIRED", "REFUNDED"];

export async function PaymentsTab({ event, status }: { event: ElevateEvent; status?: string }) {
  const [all, coupons] = await Promise.all([
    apiList<Payment>(`/events/${event.id}/payments`),
    apiList<Coupon>(`/events/${event.id}/coupons`),
  ]);
  const payments = status ? all.filter((p) => p.status === status) : all;
  const sum = (s: string) => all.filter((p) => p.status === s).reduce((a, p) => a + (p.amount ?? 0), 0);
  const cur = event.currency ?? all[0]?.currency ?? "INR";
  const fee = eventFee(event);
  const base = `/admin/events/${event.id}?tab=payments`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Collected" value={formatMoney(sum("PAID"), cur)} hint={`${all.filter((p) => p.status === "PAID").length} payments`} icon={<IndianRupee className="h-4 w-4" />} />
        <Stat label="Pending" value={formatMoney(sum("CREATED"), cur)} hint={`${all.filter((p) => p.status === "CREATED").length} awaiting payment`} />
        <Stat label="Refunded" value={formatMoney(sum("REFUNDED"), cur)} />
        <Stat label="Fee" value={fee ? money(fee.currentAmount, fee.currency) : "Free"} hint={fee ? (fee.feeType === "PER_TEAM" ? "per team" : "per person") + (fee.currentAmount !== fee.amount ? ` · early bird (regular ${money(fee.amount, fee.currency)})` : "") : "Set a fee in Edit details"} />
      </div>

      <Card>
        <CardHeader
          title="Payments"
          description="Online payments are confirmed automatically. Mark cash or bank transfers as paid here."
          action={<LinkButton href={`/api/proxy/events/${event.id}/payments?format=csv${status ? `&status=${status}` : ""}`} external size="sm" variant="outline"><Download className="h-4 w-4" />Export CSV</LinkButton>}
        />
        <div className="flex flex-wrap gap-1 border-b border-border px-5 py-2 text-sm">
          {FILTERS.map((f) => (
            <Link key={f || "all"} href={f ? `${base}&status=${f}` : base}
              className={cn("rounded-full px-3 py-1", (status ?? "") === f ? "bg-primary/10 font-medium text-primary" : "text-muted hover:text-fg")}>
              {f ? PAYMENT_LABELS[f] : "All"} <span className="tabular-nums text-xs">({f ? all.filter((p) => p.status === f).length : all.length})</span>
            </Link>
          ))}
        </div>
        {payments.length ? (
          <Table>
            <thead><tr><Th>Payer</Th><Th>Team</Th><Th>Amount</Th><Th>Status</Th><Th>Receipt</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td><p className="font-medium">{p.user?.name ?? "—"}</p><p className="text-xs text-muted">{p.user?.email}</p></Td>
                  <Td className="text-sm">{p.team?.name ?? <span className="text-muted">—</span>}{(p.quantity ?? 1) > 1 && <span className="block text-xs text-muted">{p.quantity} seats</span>}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    <p className="font-medium">{money(p.amount, p.currency ?? cur)}</p>
                    {!!p.discount && <p className="text-xs text-muted">−{money(p.discount, p.currency ?? cur)}{p.coupon?.code ? ` (${p.coupon.code})` : ""}</p>}
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={p.status} />
                    <p className="mt-0.5 text-xs text-muted">{p.paidAt ? fmtDateTime(p.paidAt) : p.createdAt ? fmtDateTime(p.createdAt) : ""}{p.provider && p.provider !== "RAZORPAY" ? ` · ${p.provider.toLowerCase()}` : ""}</p>
                  </Td>
                  <Td>
                    {p.receiptNo && <p className="font-mono text-xs">{p.receiptNo}</p>}
                    {p.status === "PAID" || p.status === "REFUNDED" ? (
                      <a href={`/api/proxy/payments/${p.id}/receipt.pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><FileText className="h-3 w-3" />PDF</a>
                    ) : null}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {["CREATED", "FAILED", "EXPIRED"].includes(p.status) && (
                        <ApiButton path={`/payments/${p.id}/mark-paid`} body={{ notes: "Marked paid by admin" }} size="sm" variant="outline" confirm={`Mark ${money(p.amount, p.currency ?? cur)} from ${p.user?.name ?? "this payer"} as paid (cash / bank transfer)?`}>Mark paid</ApiButton>
                      )}
                      {p.status === "PAID" && (
                        <ApiButton path={`/payments/${p.id}/refund`} body={{ reason: "Refunded by admin" }} size="sm" variant="ghost" className="text-red-600" confirm={`Refund ${money(p.amount, p.currency ?? cur)} to ${p.user?.name ?? "this payer"}? Their registration${(p.quantity ?? 1) > 1 ? "s" : ""} will be cancelled.`}>Refund</ApiButton>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title={status ? "No payments with this status" : "No payments yet"} description="Payments appear here as soon as someone starts a paid registration." /></div>}
      </Card>

      <Card>
        <CardHeader title="Coupons" description="Discount codes participants enter while registering" />
        {coupons.length > 0 && (
          <Table>
            <thead><tr><Th>Code</Th><Th>Discount</Th><Th>Used</Th><Th>Valid until</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono font-semibold"><Ticket className="mr-1.5 inline h-3.5 w-3.5 text-primary" />{c.code}</Td>
                  <Td>{c.percentOff ? `${c.percentOff}% off` : c.amountOff ? `${money(c.amountOff, cur)} off` : "—"}</Td>
                  <Td className="tabular-nums">{c.usedCount ?? 0}{c.maxUses ? ` / ${c.maxUses}` : ""}</Td>
                  <Td className="text-muted">{c.validUntil ? fmtDateTime(c.validUntil) : "No expiry"}</Td>
                  <Td>{c.active === false ? <Badge>Disabled</Badge> : <Badge tone="green">Active</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <ApiButton method="PATCH" path={`/coupons/${c.id}`} body={{ active: c.active === false }} size="sm" variant="outline">{c.active === false ? "Enable" : "Disable"}</ApiButton>
                      {!c.usedCount && <ApiButton method="DELETE" path={`/coupons/${c.id}`} size="sm" variant="ghost" confirm={`Delete coupon ${c.code}?`}><Trash2 className="h-4 w-4" /></ApiButton>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardBody className={coupons.length ? "border-t border-border" : ""}><CouponForm eventId={event.id} /></CardBody>
      </Card>
    </div>
  );
}
