"use client";

import { useState } from "react";
import { callApi } from "@/components/client/api";
import { Button, Field, Input } from "@/components/ui";

/** Email with a "Change" link: a 6-digit code goes to the new address, and it becomes the sign-in email once confirmed. */
export function ChangeEmail({ email }: { email: string }) {
  const [current, setCurrent] = useState(email);
  const [step, setStep] = useState<"view" | "enter" | "code">("view");
  const [next, setNext] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function start() {
    setBusy(true); setMsg(null);
    try {
      await callApi("POST", "/me/email/start", { email: next });
      setStep("code");
      setMsg({ ok: true, text: `We sent a 6-digit code to ${next}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send the code" });
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true); setMsg(null);
    try {
      await callApi("POST", "/me/email/verify", { email: next, code });
      setCurrent(next.toLowerCase()); setStep("view"); setNext(""); setCode("");
      setMsg({ ok: true, text: "Email updated. Use it the next time you sign in." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't confirm the code" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label="Email" hint={step === "view" ? "Your sign-in email and where event emails go." : undefined}>
      {step === "view" && (
        <div className="flex gap-2">
          <Input value={current} disabled readOnly />
          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => { setStep("enter"); setMsg(null); }}>Change</Button>
        </div>
      )}
      {step === "enter" && (
        <div className="flex gap-2">
          <Input type="email" value={next} onChange={(e) => setNext(e.target.value)} placeholder="new@email.com" autoFocus />
          <Button type="button" size="sm" className="h-10 shrink-0" disabled={busy || !/\S+@\S+\.\S+/.test(next)} onClick={() => void start()}>{busy ? "Sending…" : "Send code"}</Button>
        </div>
      )}
      {step === "code" && (
        <div className="flex gap-2">
          <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" autoFocus />
          <Button type="button" size="sm" className="h-10 shrink-0" disabled={busy || code.length !== 6} onClick={() => void verify()}>{busy ? "Checking…" : "Confirm"}</Button>
        </div>
      )}
      {step !== "view" && <button type="button" onClick={() => { setStep("view"); setMsg(null); }} className="mt-1 text-xs text-muted underline">Cancel</button>}
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </Field>
  );
}
