/**
 * Sequence-draft dispatch decision — pure helper.
 *
 * The approve route (single OR bulk) flips a draft to `approved` and
 * emits `email.send.queued`. The consumer (sequence-draft-to-outbound
 * Inngest fn) translates that into an outboundEmails row so the
 * existing processOutboundEmails cron can actually send it.
 *
 * This module is the pure decision layer: "given a draft, what should
 * the dispatcher do?". Keeping it pure means we test the routing
 * matrix without touching a DB.
 *
 * Channel matrix (as of 2026-05-28):
 *   email           → dispatch to outboundEmails (this is the loop closed
 *                     by feat/pilae-draft-to-outbound-bridge)
 *   linkedin_invite → already handled by linkedin-send-worker reading
 *                     linkedinMessages directly. Skip here.
 *   linkedin_message → same as above.
 *   phone_task      → no worker yet (depends on feat/voice-cold-call).
 *                     Skip here without erroring; draft stays approved
 *                     for the future handler to pick up.
 *
 * Status matrix:
 *   approved → dispatch
 *   anything else → skip (the consumer was fired too early OR after
 *                   another consumer already processed it).
 */

import type { DraftStatus } from "./state-machine";

export type DispatchInputs = {
  status: DraftStatus | string;
  channel: string;
};

export type DispatchDecision =
  | { dispatch: true; via: "email" }
  | {
      dispatch: false;
      reason:
        | "status_not_approved"
        | "channel_routed_elsewhere"
        | "channel_pending_handler"
        | "channel_unknown";
    };

export function decideDispatch(i: DispatchInputs): DispatchDecision {
  if (i.status !== "approved") {
    return { dispatch: false, reason: "status_not_approved" };
  }
  switch (i.channel) {
    case "email":
      return { dispatch: true, via: "email" };
    case "linkedin_invite":
    case "linkedin_message":
      // Handled by linkedin-send-worker (reads from linkedinMessages
      // directly, not from this dispatcher).
      return { dispatch: false, reason: "channel_routed_elsewhere" };
    case "phone_task":
      // Waiting on the voice cold call stack to merge.
      return { dispatch: false, reason: "channel_pending_handler" };
    default:
      return { dispatch: false, reason: "channel_unknown" };
  }
}
