"use client";

import { useState } from "react";
import { callApi } from "@/components/client/api";
import { Button, Input } from "@/components/ui";

export function DeleteAccountButton() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <label className="block space-y-1.5 text-sm">
        <span>Type <b>DELETE</b> to confirm</span>
        <Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
      <Button
        type="button" variant="danger" disabled={text !== "DELETE" || busy} className="w-full"
        onClick={async () => {
          setBusy(true); setError(null);
          try {
            await callApi("DELETE", "/me", { confirm: "DELETE" });
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/?deleted=1";
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't delete the account");
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
