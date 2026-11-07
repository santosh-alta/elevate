"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BadgePercent, Check, Crown, Loader2, Plus, Trash2, X } from "lucide-react";
import { formatMoney } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { PaymentPanel, unwrapPayment } from "@/components/client/payment-panel";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import type { EventFee, Payment, ProblemStatement, Track, User } from "@/lib/types";

interface Question { id: string; label: string; type?: string; required?: boolean; options?: string[] }
interface Member { name: string; email: string; phone: string; _k: string }
interface CouponState { code: string; valid: boolean; discount: number; finalAmount: number; message?: string }

const k = () => Math.random().toString(36).slice(2);
const blank = (): Member => ({ name: "", email: "", phone: "", _k: k() });

export function RegisterForm({
  eventId, slug, user, questions, teamMode, minSize, maxSize, tracks, problems, fee, requiresApproval,
}: {
  eventId: string; slug: string; user: User; questions: Question[];
  /** Leader registers the whole team (teams module on and not JOIN_LATER). */
  teamMode: boolean; minSize: number; maxSize: number; tracks: Track[]; problems: ProblemStatement[];
  fee: EventFee | null; requiresApproval?: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(() => Array.from({ length: Math.max(0, minSize - 1) }, blank));
  const [teamName, setTeamName] = useState("");
  const [trackId, setTrackId] = useState("");
  const [problemId, setProblemId] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  const teamSize = teamMode ? members.length + 1 : 1;
  const seats = fee ? (fee.feeType === "PER_TEAM" ? 1 : teamSize) : 0;
  const subtotal = fee ? fee.currentAmount * seats : 0;
  const discount = coupon?.valid ? coupon.discount : 0;
  const total = coupon?.valid ? coupon.finalAmount : subtotal;
  const cur = fee?.currency ?? "INR";
  const shownProblems = problems.filter((p) => !trackId || !p.trackId || p.trackId === trackId);

  const setMember = (key: string, patch: Partial<Member>) => setMembers((m) => m.map((x) => (x._k === key ? { ...x, ...patch } : x)));
  const dupEmail = useMemo(() => {
    const seen = new Set([user.email.toLowerCase()]);
    for (const m of members) {
      const e = m.email.trim().toLowerCase();
      if (!e) continue;
      if (seen.has(e)) return e;
      seen.add(e);
    }
    return null;
  }, [members, user.email]);

  async function checkCoupon(code = couponInput) {
    const c = code.trim().toUpperCase();
    if (!c) { setCoupon(null); return; }
    setChecking(true);
    try {
      const r = await callApi<{ valid: boolean; discount?: number; finalAmount?: number; message?: string }>("POST", `/events/${eventId}/coupons/check`, { code: c, teamSize });
      setCoupon({ code: c, valid: !!r.valid, discount: r.discount ?? 0, finalAmount: r.finalAmount ?? subtotal, message: r.message });
    } catch (e) {
      setCoupon({ code: c, valid: false, discount: 0, finalAmount: subtotal, message: e instanceof Error ? e.message : "Invalid code" });
    } finally {
      setChecking(false);
    }
  }

  async function submit(form: HTMLFormElement) {
    setError(null);
    if (dupEmail) { setError(`${dupEmail} is listed twice. Each member needs their own email.`); return; }
    if (teamMode && (teamSize < minSize || teamSize > maxSize)) { setError(`Teams need ${minSize}–${maxSize} members including you.`); return; }
    const fd = new FormData(form);
    const answers: Record<string, unknown> = {};
    for (const q of questions) {
      const v = fd.getAll(`q:${q.id}`).map(String).filter(Boolean);
      if (q.type === "checkbox") answers[q.id] = v;
      else if (v[0]) answers[q.id] = v[0];
    }
    const body: Record<string, unknown> = { answers };
    if (teamMode) {
      body.team = {
        name: teamName.trim(),
        ...(trackId ? { trackId } : {}),
        ...(problemId ? { problemStatementId: problemId } : {}),
        members: members.map((m) => ({ name: m.name.trim(), email: m.email.trim().toLowerCase(), ...(m.phone.trim() ? { phone: m.phone.trim() } : {}) })),
      };
    }
    if (coupon?.valid) body.couponCode = coupon.code;
    else if (couponInput.trim() && fee) body.couponCode = couponInput.trim().toUpperCase();

    setBusy(true);
    try {
      const res = await callApi<unknown>("POST", `/events/${eventId}/register`, body);
      const pay = unwrapPayment(res && typeof res === "object" && "payment" in res ? (res as { payment?: unknown }).payment : null);
      if (pay && pay.status !== "PAID") {
        setPayment(pay);
        setBusy(false);
        return;
      }
      router.push(`/events/${slug}/register/success${pay ? `?payment=${pay.id}` : ""}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
      setBusy(false);
    }
  }

  if (payment) {
    return (
      <div className="space-y-4">
        <div className="rounded-brand border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-medium"><Check className="h-4 w-4" />Details saved{teamMode ? ` for team ${teamName}` : ""}.</p>
          <p className="mt-0.5">Pay now to confirm {teamMode && seats > 1 ? "your team's seats" : "your seat"}.</p>
        </div>
        <PaymentPanel initial={payment} successHref={`/events/${slug}/register/success`} autoOpen />
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }}>
      {teamMode && (
        <Card>
          <CardHeader title="Your team" description={`${minSize === maxSize ? `${minSize}` : `${minSize}–${maxSize}`} members including you. Everyone you add gets an email with their ticket.`} />
          <CardBody className="space-y-4">
            <Field label="Team name"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={60} placeholder="e.g. Byte Bandits" /></Field>
            {(tracks.length > 0 || shownProblems.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {tracks.length > 0 && (
                  <Field label="Track">
                    <Select value={trackId} onChange={(e) => { setTrackId(e.target.value); setProblemId(""); }}>
                      <option value="">Choose a track</option>
                      {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </Field>
                )}
                {shownProblems.length > 0 && (
                  <Field label="Problem statement" hint="You can change it later on your team page">
                    <Select value={problemId} onChange={(e) => setProblemId(e.target.value)}>
                      <option value="">Decide later</option>
                      {shownProblems.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.title}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Members</p>
              <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <Crown className="h-4 w-4 text-primary" />
                <span className="font-medium">{user.name}</span>
                <span className="truncate text-muted">{user.email}</span>
                <span className="ml-auto text-xs font-medium text-primary">Leader (you)</span>
              </div>
              {members.map((m, i) => (
                <div key={m._k} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1.2fr_0.8fr_auto]">
                  <Input value={m.name} onChange={(e) => setMember(m._k, { name: e.target.value })} required placeholder={`Member ${i + 2} name`} aria-label={`Member ${i + 2} name`} />
                  <Input value={m.email} onChange={(e) => setMember(m._k, { email: e.target.value })} required type="email" placeholder="Email" aria-label={`Member ${i + 2} email`}
                    className={dupEmail && m.email.trim().toLowerCase() === dupEmail ? "border-red-500" : undefined} />
                  <Input value={m.phone} onChange={(e) => setMember(m._k, { phone: e.target.value })} type="tel" placeholder="Phone (optional)" aria-label={`Member ${i + 2} phone`} />
                  <button type="button" aria-label={`Remove member ${i + 2}`} disabled={teamSize <= minSize}
                    className={buttonClass("ghost", "sm", "h-10")} onClick={() => { setMembers((x) => x.filter((y) => y._k !== m._k)); if (coupon) setCoupon(null); }}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {dupEmail && <p className="text-xs text-red-600">{dupEmail} is used twice.</p>}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" disabled={teamSize >= maxSize} onClick={() => { setMembers((x) => [...x, blank()]); if (coupon) setCoupon(null); }}>
                  <Plus className="h-4 w-4" />Add member
                </Button>
                <span className="text-xs text-muted">{teamSize} of {maxSize} members</span>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {questions.length > 0 && (
        <Card>
          <CardHeader title={teamMode ? "About you" : "A few questions"} />
          <CardBody className="space-y-4">
            {questions.map((q) => (
              <Field key={q.id} label={q.label + (q.required ? " *" : "")}>
                {q.options?.length && q.type === "checkbox" ? (
                  <span className="flex flex-wrap gap-2">
                    {q.options.map((o) => <label key={o} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={`q:${q.id}`} value={o} className="accent-[rgb(var(--primary))]" />{o}</label>)}
                  </span>
                ) : q.options?.length ? (
                  <Select name={`q:${q.id}`} required={q.required} defaultValue=""><option value="" disabled>Choose…</option>{q.options.map((o) => <option key={o}>{o}</option>)}</Select>
                ) : q.type === "textarea" ? (
                  <Textarea name={`q:${q.id}`} required={q.required} />
                ) : (
                  <Input name={`q:${q.id}`} required={q.required} type={q.type === "email" || q.type === "tel" || q.type === "number" || q.type === "url" ? q.type : "text"} />
                )}
              </Field>
            ))}
          </CardBody>
        </Card>
      )}

      {fee && (
        <Card>
          <CardHeader title="Payment" />
          <CardBody className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <BadgePercent className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input value={couponInput} onChange={(e) => { setCouponInput(e.target.value); if (coupon) setCoupon(null); }} onBlur={() => { if (couponInput.trim() && !coupon) void checkCoupon(); }}
                  placeholder="Coupon code" aria-label="Coupon code" className="pl-9 font-mono uppercase" />
              </div>
              <Button type="button" variant="outline" disabled={checking || !couponInput.trim()} onClick={() => checkCoupon()}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {coupon && (
              <p className={`flex items-center gap-1.5 text-sm ${coupon.valid ? "text-emerald-700" : "text-red-600"}`}>
                {coupon.valid ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {coupon.message ?? (coupon.valid ? `${coupon.code} applied — you save ${formatMoney(coupon.discount, cur)}` : "This code isn't valid")}
              </p>
            )}
            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">
                  {formatMoney(fee.currentAmount, cur)} {fee.feeType === "PER_TEAM" ? "per team" : `× ${seats} ${seats === 1 ? "person" : "people"}`}
                  {fee.currentAmount < fee.amount && <span className="ml-1 text-xs">(early bird, regular <s>{formatMoney(fee.amount, cur)}</s>)</span>}
                </dt>
                <dd className="tabular-nums">{formatMoney(subtotal, cur)}</dd>
              </div>
              {discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Coupon {coupon?.code}</dt><dd className="tabular-nums">−{formatMoney(discount, cur)}</dd></div>}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{total > 0 ? formatMoney(total, cur) : "Free"}</dd></div>
            </dl>
          </CardBody>
        </Card>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy || checking}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {fee && total > 0 ? `Continue to pay ${formatMoney(total, cur)}` : teamMode ? "Register team" : "Register"}
        </Button>
        {requiresApproval && <p className="text-xs text-muted">Registrations are reviewed by the organisers.</p>}
      </div>
    </form>
  );
}
