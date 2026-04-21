import type { ChannelAdapter, DispatchInput, DispatchResult } from "./types";

/**
 * Email adapter — thin shim over the existing outbound pipeline.
 * The current `sendSequenceStep` (inngest/functions.ts) already knows
 * how to render templates, pick a mailbox, inject the unsubscribe
 * footer, and enqueue through Resend. Refactoring that end-to-end
 * into the adapter is a follow-up; for now the adapter exists so
 * (a) new non-email steps can't accidentally break email, and
 * (b) the dispatch registry has a self-describing `email` entry.
 *
 * The legacy sendSequenceStep continues to run unchanged and is the
 * source of truth for email delivery. When callers opt into the new
 * `dispatchStep` flow, they get back `{ pendingReason: "delegated
 * to legacy sendSequenceStep" }` so status tracking stays accurate.
 */
export const emailAdapter: ChannelAdapter = {
  type: "email",
  isAvailable(): boolean {
    // Email is always "available" — absence of Resend / Gmail config is
    // caught downstream by the existing send worker with better context.
    return true;
  },
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    return {
      ok: true,
      channel: "email",
      artefactId: input.step.id,
      pendingReason: "delegated to legacy sendSequenceStep pipeline",
    };
  },
};
