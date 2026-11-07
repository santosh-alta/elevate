"use client";

import { useState } from "react";
import { callApi } from "@/components/client/api";
import { Button, Field, Input } from "@/components/ui";
import type { User } from "@/lib/types";

const autoName = (u: User) => u.name === u.email.split("@")[0];

export function ProfileForm({ user, next, first }: { user: User; next: string; first: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const year = new Date().getFullYear();

  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (k: string) => String(fd.get(k) ?? "").trim();
        setBusy(true); setError(null); setSaved(false);
        try {
          await callApi("PATCH", "/me", {
            name: v("name"), phone: v("phone"), college: v("college"), degree: v("degree"), city: v("city"),
            graduationYear: v("graduationYear") ? Number(v("graduationYear")) : null,
            linkedinUrl: v("linkedinUrl"), githubUrl: v("githubUrl"), portfolioUrl: v("portfolioUrl"),
            completeProfile: true,
          });
          if (first) window.location.href = next;
          else { setSaved(true); setBusy(false); }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save");
          setBusy(false);
        }
      }}
    >
      <Field label="Full name *" hint="Exactly as it should appear on your certificates.">
        <Input name="name" required minLength={2} autoFocus={first} defaultValue={autoName(user) ? "" : user.name} placeholder="e.g. Priya Sharma" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email"><Input value={user.email} disabled readOnly /></Field>
        <Field label="Mobile number *" hint="For event-day updates.">
          <Input name="phone" type="tel" required inputMode="tel" defaultValue={user.phone ?? ""} placeholder="98765 43210" />
        </Field>
      </div>
      <Field label="College or organisation *">
        <Input name="college" required defaultValue={user.college ?? ""} placeholder="e.g. Alta School of Technology" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Course / degree"><Input name="degree" defaultValue={user.degree ?? ""} placeholder="B.Tech CSE" /></Field>
        <Field label="Graduation year">
          <Input name="graduationYear" type="number" min={1950} max={year + 8} defaultValue={user.graduationYear ?? ""} placeholder={String(year + 2)} />
        </Field>
        <Field label="City"><Input name="city" defaultValue={user.city ?? ""} placeholder="Bengaluru" /></Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="LinkedIn" hint="Profile link or username, so we can tag you.">
          <Input name="linkedinUrl" defaultValue={user.linkedinUrl ?? ""} placeholder="linkedin.com/in/yourname" />
        </Field>
        <Field label="GitHub"><Input name="githubUrl" defaultValue={user.githubUrl ?? ""} placeholder="github.com/yourname" /></Field>
      </div>
      <Field label="Portfolio or website"><Input name="portfolioUrl" defaultValue={user.portfolioUrl ?? ""} placeholder="yourname.dev" /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">Saved.</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : first ? "Continue" : "Save changes"}</Button>
    </form>
  );
}
