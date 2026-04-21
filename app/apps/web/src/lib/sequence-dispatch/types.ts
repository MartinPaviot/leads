/**
 * Sequence step dispatch — channel adapter contract.
 *
 * A sequence step is "what should happen" (an email, a LinkedIn
 * message, a physical gift, a phone task). Adapters translate the
 * abstract step into an actual side effect on the right channel.
 * The cron scheduler (`sequence-cron.ts`) and the step worker
 * (`functions.ts:sendSequenceStep`) stay channel-agnostic — they
 * resolve a step, hand it to the adapter registry, and trust the
 * result for status tracking.
 */

export type SequenceStepType =
  | "email"
  | "linkedin_message"
  | "sms"
  | "gift"
  | "phone_task";

export interface DispatchInput {
  tenantId: string;
  enrollmentId: string;
  contactId: string;
  step: {
    id: string;
    stepNumber: number;
    stepType: SequenceStepType;
    subjectTemplate: string;
    bodyTemplate: string;
    channelConfig: Record<string, unknown>;
  };
}

export interface DispatchResult {
  ok: boolean;
  channel: SequenceStepType;
  /** When ok, this is the primary identifier of the emitted artefact
   *  (outbound_emails.id for email, task.id for phone_task, etc.). */
  artefactId?: string;
  /** When ok and delivery is fire-and-forget / queued for later,
   *  callers should not advance the enrollment past the step until the
   *  downstream worker confirms — record the pending reason here. */
  pendingReason?: string;
  error?: string;
}

export interface ChannelAdapter {
  type: SequenceStepType;
  /** True when the adapter can actually send (has credentials / flags on). */
  isAvailable(): boolean;
  dispatch(input: DispatchInput): Promise<DispatchResult>;
}
