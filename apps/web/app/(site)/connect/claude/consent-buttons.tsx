"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button } from "@/components/ui";

/** Allow / Cancel on the approval page: tells the API, then goes back to the app (e.g. claude.ai). */
export function ConsentButtons({ req }: { req: string }) {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (allow: boolean) => {
    setBusy(allow ? "allow" : "deny"); setError(null);
    try {
      const r = await callApi<{ redirect: string }>("POST", `/oauth/requests/${encodeURIComponent(req)}/decision`, { allow });
      window.location.href = r.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="button" className="flex-1" onClick={() => decide(true)} disabled={busy !== null}>
          {busy === "allow" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Allow
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => decide(false)} disabled={busy !== null}>Cancel</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
