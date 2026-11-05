"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { callApi } from "./api";
import { buttonClass, type ButtonSize, type ButtonVariant } from "../ui/button";

export function ApiButton({
  method = "POST", path, body, children, variant = "primary", size = "md", confirm, className, successMessage,
}: {
  method?: string; path: string; body?: unknown; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize;
  confirm?: string; className?: string; successMessage?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={busy}
        className={buttonClass(variant, size, className)}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true); setMsg(null);
          try {
            await callApi(method, path, body);
            if (successMessage) setMsg({ ok: true, text: successMessage });
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {msg && <span className={`mt-1 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
    </span>
  );
}
