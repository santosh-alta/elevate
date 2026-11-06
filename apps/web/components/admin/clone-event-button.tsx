"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Field, Input } from "@/components/ui";
import { toLocalInput } from "@/lib/format";

/** "Duplicate event": copies details, guests, sponsors and checklist into a new DRAFT, then opens it. */
export function CloneEventButton({ eventId, title, startsAt, endsAt }: { eventId: string; title: string; startsAt: string; endsAt: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Copy className="h-4 w-4" />Duplicate</Button>;
  return (
    <form
      className="w-full max-w-md space-y-3 rounded-brand border border-border bg-card p-4 shadow-lg"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const iso = (k: string) => (fd.get(k) ? new Date(fd.get(k) as string).toISOString() : undefined);
        setBusy(true); setError(null);
        try {
          const res = await callApi<{ id?: string; event?: { id: string } }>("POST", `/events/${eventId}/clone`, {
            title: (fd.get("title") as string)?.trim() || undefined, startsAt: iso("startsAt"), endsAt: iso("endsAt"),
          });
          const id = res?.id ?? res?.event?.id;
          if (id) router.push(`/admin/events/${id}`);
          else router.push("/admin/events");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not duplicate");
          setBusy(false);
        }
      }}
    >
      <p className="font-medium">Duplicate this event</p>
      <p className="text-xs text-muted">Copies details, modules, agenda, guests (as proposed), sponsors and a fresh checklist into a new draft.</p>
      <Field label="New title"><Input name="title" defaultValue={`${title} (copy)`} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts"><Input type="datetime-local" name="startsAt" defaultValue={toLocalInput(startsAt)} /></Field>
        <Field label="Ends"><Input type="datetime-local" name="endsAt" defaultValue={toLocalInput(endsAt)} /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Duplicating…" : "Create copy"}</Button>
      </div>
    </form>
  );
}
