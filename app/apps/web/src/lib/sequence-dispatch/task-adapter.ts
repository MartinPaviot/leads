/**
 * Manual-task channel adapter — the "no live integration yet" delivery for
 * non-email channels (LinkedIn, phone). Instead of sending, it records a task in
 * the "Needs you" lane (`agentActions`, awaitingApproval) so the founder performs
 * the touch by hand. This makes a multi-channel cadence REAL today — a LinkedIn
 * step becomes an actual to-do, not a misfired email — without waiting on the
 * provider integration (Unipile et al.).
 *
 * Safety: `awaitingApproval` rows have NO scheduledExecutionAt, so the
 * agent-action-dispatcher never claims them (it requires scheduledExecutionAt <=
 * now) — they cannot be auto-executed; they only surface for the human. When the
 * channel's live provider is wired, swap this adapter for the sending one; the
 * cron stays unchanged (it just calls dispatchStep).
 *
 * Pure-injectable: `record` is the only side effect, so it unit-tests with a stub.
 */

import { recordAgentAction } from "@/lib/agents/agent-actions";
import type { ChannelAdapter, DispatchInput, DispatchResult, SequenceStepType } from "./types";

export interface ManualTaskDeps {
  record?: typeof recordAgentAction;
}

/** Build a manual-task adapter for a channel that has no live provider yet. */
export function makeManualTaskAdapter(type: SequenceStepType, deps: ManualTaskDeps = {}): ChannelAdapter {
  const record = deps.record ?? recordAgentAction;
  return {
    type,
    // A manual task can always be created — the human is the "channel".
    isAvailable: () => true,
    async dispatch(input: DispatchInput): Promise<DispatchResult> {
      try {
        const { id } = await record({
          tenantId: input.tenantId,
          actionType: `manual_${type}`, // e.g. manual_linkedin_message, manual_phone_task
          awaitingApproval: true, // → "Needs you" lane, never auto-dispatched
          payload: {
            channel: type,
            contactId: input.contactId,
            enrollmentId: input.enrollmentId,
            stepId: input.step.id,
            stepNumber: input.step.stepNumber,
            // The drafted touch — what the founder should say.
            subject: input.step.subjectTemplate,
            body: input.step.bodyTemplate,
            channelConfig: input.step.channelConfig,
          },
        });
        return { ok: true, channel: type, artefactId: id, pendingReason: "manual touch queued in the Needs-you lane" };
      } catch (err) {
        return { ok: false, channel: type, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
