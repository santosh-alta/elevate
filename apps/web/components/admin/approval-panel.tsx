"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Clock, FileEdit, XCircle } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Button, Textarea } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";

/**
 * Approval state of an organizer's event page, with the actions the viewer may take:
 * organizers submit; admins and moderators approve (which publishes) or send back with a note;
 * admins switch paid registration on or off. Hidden for staff events that never needed approval.
 */
export function ApprovalPanel({ event, reviewer, admin }: { event: ElevateEvent; reviewer: boolean; admin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const status = event.approvalStatus ?? "APPROVED";
  const organizerEvent = status !== "APPROVED" || !!event.reviewedAt || event.paidAllowed === false;
  if (!organizerEvent) return null;

  async function act(path: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      await callApi("POST", path, body);
      setRejecting(false); setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const look = {
    DRAFT: { icon: FileEdit, tone: "border-border bg-card", title: "Not submitted yet", text: "This page is hidden. When it's ready, submit it and an admin or moderator will review it." },
    PENDING: { icon: Clock, tone: "border-amber-300 bg-amber-50 text-amber-900", title: "Waiting for review", text: `Submitted ${event.submittedAt ? fmtDateTime(event.submittedAt) : ""}. The page stays hidden until it's approved.` },
    REJECTED: { icon: XCircle, tone: "border-red-300 bg-red-50 text-red-900", title: "Changes requested", text: "Make the changes below, then submit it again." },
    APPROVED: { icon: CheckCircle2, tone: "border-green-300 bg-green-50 text-green-900", title: "Approved", text: event.reviewedAt ? `Approved ${fmtDateTime(event.reviewedAt)}.` : "" },
  }[status];
  const Icon = look.icon;

  return (
    <div className={`rounded-brand border p-4 ${look.tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{look.title}</p>
            <p className="text-sm opacity-90">{look.text}</p>
            {event.approvalNote && (status === "REJECTED" || status === "APPROVED") && (
              <p className="mt-2 whitespace-pre-line rounded-md bg-white/70 p-2 text-sm"><span className="font-medium">Reviewer&apos;s note: </span>{event.approvalNote}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(status === "DRAFT" || status === "REJECTED") && (
            <Button size="sm" disabled={busy} onClick={() => act(`/events/${event.id}/submit`)}>
              {status === "REJECTED" ? "Submit again" : "Submit for review"}
            </Button>
          )}
          {reviewer && status !== "APPROVED" && status !== "DRAFT" && !rejecting && (
            <>
              <Button size="sm" disabled={busy} onClick={() => act(`/events/${event.id}/review`, { decision: "APPROVE" })}>Approve &amp; publish</Button>
              {status === "PENDING" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Send back</Button>}
            </>
          )}
        </div>
      </div>

      {rejecting && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => { e.preventDefault(); act(`/events/${event.id}/review`, { decision: "REJECT", note }); }}
        >
          <Textarea required rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the organizer change? They'll get this by email." />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !note.trim()}>Send back to organizer</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {admin && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-current/10 pt-3 text-sm">
          <span>Paid registration: <span className="font-medium">{event.paidAllowed ? "allowed" : "not allowed (free event)"}</span></span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/events/${event.id}/paid-allowed`, { allowed: !event.paidAllowed })}>
            {event.paidAllowed ? "Turn off" : "Allow paid registration"}
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
