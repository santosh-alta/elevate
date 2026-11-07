import { Badge, type Tone } from "./ui/badge";

const PAYMENT_TONES: Record<string, Tone> = { CREATED: "amber", PAID: "green", FAILED: "red", EXPIRED: "gray", REFUNDED: "purple" };
export const PAYMENT_LABELS: Record<string, string> = { CREATED: "Payment pending", PAID: "Paid", FAILED: "Failed", EXPIRED: "Expired", REFUNDED: "Refunded" };

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge tone={PAYMENT_TONES[status] ?? "gray"}>{PAYMENT_LABELS[status] ?? status}</Badge>;
}
