"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CreditCard, FlaskConical, Loader2, RotateCw } from "lucide-react";
import { formatMoney } from "@elevate/shared";
import { callApi } from "./api";
import { buttonClass } from "../ui/button";
import type { CheckoutInfo, Payment } from "@/lib/types";

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayInstance { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string; reason?: string } }) => void) => void }
declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Could not load the payment window. Check your connection and try again.")); };
    document.body.appendChild(s);
  });
  return loading;
}

function brandColor(): string | undefined {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return v ? `rgb(${v.split(/\s+/).join(",")})` : undefined;
}

/** `/payments/:id/retry` and register responses may wrap the payment as `{ payment }`. */
export function unwrapPayment(res: unknown): Payment | null {
  if (!res || typeof res !== "object") return null;
  const o = res as { payment?: Payment } & Partial<Payment>;
  if (o.payment && typeof o.payment === "object") return o.payment;
  return typeof o.id === "string" && typeof o.amount === "number" ? (o as Payment) : null;
}

/**
 * Pays for a registration: opens Razorpay checkout (or the dev simulator), verifies the signature through the API,
 * offers a retry on failure, then sends the user to the success page.
 */
export function PaymentPanel({ initial, successHref, autoOpen = false, title = "Complete your payment" }: {
  initial: Payment; successHref: string; autoOpen?: boolean; title?: string;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState<Payment>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(["FAILED", "EXPIRED"].includes(initial.status));
  const [started, setStarted] = useState(false);
  const checkout = payment.checkout ?? null;
  const done = (p: Payment) => router.push(`${successHref}${successHref.includes("?") ? "&" : "?"}payment=${encodeURIComponent(p.id)}`);

  async function ensureCheckout(): Promise<{ p: Payment; c: CheckoutInfo } | null> {
    if (payment.checkout && !failed) return { p: payment, c: payment.checkout };
    // No checkout (resuming from the event page) or a failed attempt: refresh, else ask for a new order.
    if (!failed && payment.status === "CREATED") {
      const fresh = unwrapPayment(await callApi<unknown>("GET", `/payments/${payment.id}`).catch(() => null));
      if (fresh?.status === "PAID") { done(fresh); return null; }
      if (fresh?.checkout && fresh.status === "CREATED") { setPayment(fresh); return { p: fresh, c: fresh.checkout }; }
    }
    const next = unwrapPayment(await callApi<unknown>("POST", `/payments/${payment.id}/retry`));
    if (!next) throw new Error("Could not start a new payment.");
    setPayment(next); setFailed(false);
    if (next.status === "PAID") { done(next); return null; }
    if (!next.checkout) throw new Error("The payment provider didn't return a checkout. Please contact the organisers.");
    return { p: next, c: next.checkout };
  }

  async function pay() {
    setBusy(true); setError(null); setStarted(true);
    try {
      const r = await ensureCheckout();
      if (!r) return;
      const { p, c } = r;
      if (c.dev) { setBusy(false); return; } // dev: the simulate button takes over
      await loadRazorpay();
      if (!window.Razorpay) throw new Error("Payment window unavailable.");
      const rzp = new window.Razorpay({
        key: c.keyId,
        order_id: c.orderId,
        amount: c.amount ?? p.amount,
        currency: c.currency ?? p.currency ?? "INR",
        name: c.name,
        description: c.description,
        prefill: c.prefill,
        theme: { color: brandColor() },
        handler: async (resp: RazorpayResponse) => {
          setBusy(true);
          try {
            await callApi("POST", "/payments/verify", resp);
            done(p);
          } catch (e) {
            setError(`We couldn't confirm the payment yet: ${e instanceof Error ? e.message : "verification failed"}. If money was deducted it will be confirmed automatically in a few minutes.`);
            setBusy(false);
          }
        },
        modal: { ondismiss: () => { setBusy(false); setError("Payment window closed. Your seat is held for a few minutes — pay to confirm it."); } },
      });
      rzp.on("payment.failed", (resp) => {
        setFailed(true);
        setBusy(false);
        setError(resp.error?.description ?? "The payment failed. You can try again.");
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be started");
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true); setError(null);
    try {
      let p = payment;
      if (failed || ["FAILED", "EXPIRED"].includes(p.status)) {
        const next = unwrapPayment(await callApi<unknown>("POST", `/payments/${p.id}/retry`));
        if (!next) throw new Error("Could not start a new payment.");
        p = next; setPayment(next); setFailed(false);
      }
      if (p.status !== "PAID") await callApi("POST", `/payments/${p.id}/dev-complete`, {});
      done(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  const isDev = checkout?.dev || payment.provider === "DEV";
  // Open Razorpay straight away right after registering.
  const opened = useRef(false);
  useEffect(() => {
    if (autoOpen && !opened.current && !started && checkout && !checkout.dev) {
      opened.current = true;
      void pay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <div className="space-y-4 rounded-brand border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted">Receipt {payment.receiptNo ?? "—"}{payment.expiresAt ? ` · seat held until ${new Date(payment.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(payment.amount, payment.currency ?? "INR")}</p>
      </div>
      {error && <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      <div className="flex flex-wrap gap-2">
        {isDev ? (
          <button type="button" className={buttonClass("primary", "lg")} disabled={busy} onClick={simulate}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Simulate payment (dev)
          </button>
        ) : failed ? (
          <button type="button" className={buttonClass("primary", "lg")} disabled={busy} onClick={pay}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}Retry payment
          </button>
        ) : (
          <button type="button" className={buttonClass("primary", "lg")} disabled={busy} onClick={pay}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Pay {formatMoney(payment.amount, payment.currency ?? "INR")}
          </button>
        )}
      </div>
      {isDev && <p className="text-xs text-muted">Development mode: no payment keys are configured, so the payment is simulated.</p>}
      {!isDev && <p className="text-xs text-muted">Secure payment by Razorpay — UPI, cards, net banking and wallets.</p>}
    </div>
  );
}
