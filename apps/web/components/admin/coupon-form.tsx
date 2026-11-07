"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/components/client/api";
import { Button, Field, Input, Select } from "@/components/ui";
import { rupeesToPaise } from "@/lib/format";

/** Create a coupon: percent or flat rupee discount (sent as paise). */
export function CouponForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const val = String(fd.get("value") ?? "").trim();
        const body: Record<string, unknown> = { code: String(fd.get("code") ?? "").trim().toUpperCase() };
        if (kind === "percent") {
          const p = Number(val);
          if (!(p > 0 && p <= 100)) { setMsg({ ok: false, text: "Percent must be between 1 and 100." }); return; }
          body.percentOff = Math.round(p);
        } else {
          const a = rupeesToPaise(val);
          if (!a || a <= 0) { setMsg({ ok: false, text: "Enter the discount in rupees." }); return; }
          body.amountOff = a;
        }
        const maxUses = String(fd.get("maxUses") ?? "").trim();
        if (maxUses) body.maxUses = Number(maxUses);
        const until = String(fd.get("validUntil") ?? "").trim();
        if (until) body.validUntil = new Date(until).toISOString();
        setBusy(true); setMsg(null);
        try {
          await callApi("POST", `/events/${eventId}/coupons`, body);
          form.reset();
          setMsg({ ok: true, text: `Coupon ${body.code} created` });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not create" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Code"><Input name="code" required pattern="[A-Za-z0-9_-]{3,30}" placeholder="EARLY50" className="font-mono uppercase" /></Field>
      <Field label="Discount">
        <div className="flex gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")} className="w-24" aria-label="Discount type">
            <option value="percent">%</option>
            <option value="amount">₹ off</option>
          </Select>
          <Input name="value" type="number" min={0} step="0.01" required placeholder={kind === "percent" ? "50" : "200"} aria-label="Discount value" />
        </div>
      </Field>
      <Field label="Max uses" hint="Empty = unlimited"><Input name="maxUses" type="number" min={1} /></Field>
      <Field label="Valid until"><Input name="validUntil" type="datetime-local" /></Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create coupon"}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
