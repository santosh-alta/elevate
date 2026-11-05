"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { callApi, formToJson } from "./api";
import { cn } from "../ui/cn";

/**
 * Generic form that submits its fields as JSON to the API via the proxy, then refreshes the page.
 * `redirectTo` may contain {id} which is replaced from the response.
 */
export function ApiForm({
  method = "POST", path, children, className, redirectTo, resetOnSuccess = true, successMessage, extra, onSuccessMessage,
}: {
  method?: string; path: string; children: ReactNode; className?: string; redirectTo?: string;
  resetOnSuccess?: boolean; successMessage?: string; extra?: Record<string, unknown>;
  /** Build a message from the response, e.g. check-in result. */
  onSuccessMessage?: "checkin";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true); setError(null); setOk(null);
        try {
          const res = await callApi<Record<string, unknown>>(method, path, { ...formToJson(form), ...extra });
          if (onSuccessMessage === "checkin") {
            const user = (res?.user as { name?: string } | undefined)?.name ?? "Participant";
            setOk(res?.alreadyCheckedIn ? `${user} was already checked in.` : `✓ ${user} checked in.`);
          } else if (successMessage) setOk(successMessage);
          if (resetOnSuccess) form.reset();
          if (redirectTo) {
            const id = (res?.id as string) ?? (res?.event as { id?: string } | undefined)?.id ?? "";
            router.push(redirectTo.replace("{id}", id));
          } else router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className={cn("contents")}>{children}</fieldset>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {ok && <p className="mt-2 text-sm text-emerald-700">{ok}</p>}
    </form>
  );
}
