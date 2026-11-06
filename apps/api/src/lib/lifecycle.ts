import type { FastifyBaseLogger } from "fastify";
import type { EventStatus } from "@prisma/client";
import { EVENT_STATUS_FLOW } from "@elevate/shared";
import { generateCertificates } from "./certificates";
import { generateLinkedInDrafts } from "./linkedin";
import { buildOutcome } from "./outcome";
import { logActivity } from "./activity";
import { notifyAudience } from "./notify";

const FINAL: EventStatus[] = ["ARCHIVED", "CANCELLED"];

/**
 * Allowed transitions:
 *  - forward along the flow (skipping steps is allowed)
 *  - one step back (to undo a mistake)
 *  - CANCELLED from any non-final state
 *  - CANCELLED → DRAFT (revive)
 */
export function canTransition(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return false;
  if (to === "CANCELLED") return !FINAL.includes(from);
  if (from === "CANCELLED") return to === "DRAFT";
  const flow = EVENT_STATUS_FLOW as readonly string[];
  const a = flow.indexOf(from);
  const b = flow.indexOf(to);
  if (a < 0 || b < 0) return false;
  return b > a || b === a - 1;
}

/**
 * Post-event automation, run when an event becomes COMPLETED.
 * Runs in-process (fire-and-forget). Planned: move to a pg-boss queue so it survives restarts and retries.
 */
export function runCompletionAutomation(eventId: string, log: FastifyBaseLogger) {
  void (async () => {
    try {
      const certs = await generateCertificates(eventId);
      await logActivity(eventId, null, "certificates.generated", certs);
      const drafts = await generateLinkedInDrafts(eventId);
      await logActivity(eventId, null, "linkedin.generated", drafts);
      await buildOutcome(eventId);
      const asked = await notifyAudience(eventId, "feedback.request");
      await logActivity(eventId, null, "feedback.requested", { recipients: asked });
      log.info({ eventId, certs, drafts }, "completion automation finished");
    } catch (err) {
      log.error({ err, eventId }, "completion automation failed");
    }
  })();
}
