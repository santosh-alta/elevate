"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";


export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "Something went wrong");
    return data;
  }

  return step === "email" ? (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          const data = await post("/api/auth/request", { email });
          setDevCode(data.devCode ?? null);
          setStep("code");
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}
    >
      <Field label="Email"><Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</Button>
    </form>
  ) : (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          const data = await post("/api/auth/verify", { email, code });
          // First sign-in: the one-time profile page, then on to where they were going.
          window.location.href = data.user?.profileCompletedAt ? next : `/profile?next=${encodeURIComponent(next)}`;
        } catch (err) { setError((err as Error).message); setBusy(false); }
      }}
    >
      <p className="text-sm text-muted">Enter the 6-digit code sent to <span className="font-medium text-fg">{email}</span>.</p>
      {devCode && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Dev mode code: <span className="font-mono font-semibold">{devCode}</span></p>}
      <Input inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="text-center font-mono text-lg tracking-[0.4em]" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Verifying…" : "Sign in"}</Button>
      <button type="button" onClick={() => setStep("email")} className="w-full text-center text-xs text-muted hover:text-fg">Use a different email</button>
    </form>
  );
}
