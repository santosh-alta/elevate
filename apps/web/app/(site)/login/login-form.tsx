"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { callApi } from "@/components/client/api";

/** New accounts start with the email's first part as their name; ask for the real one once. */
const needsName = (u: { name?: string; email?: string } | undefined) => !!u?.email && (!u.name || u.name === u.email.split("@")[0]);

export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code" | "name">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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

  if (step === "name") {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          try {
            await callApi("PATCH", "/me", { name: name.trim() });
            window.location.href = next;
          } catch (err) { setError((err as Error).message); setBusy(false); }
        }}
      >
        <p className="text-sm text-muted">You&apos;re signed in. One last thing: what&apos;s your name?</p>
        <Field label="Full name" hint="Exactly as it should appear on your certificates.">
          <Input required autoFocus minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Continue"}</Button>
      </form>
    );
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
          if (needsName(data.user)) { setStep("name"); setBusy(false); return; }
          window.location.href = next;
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
