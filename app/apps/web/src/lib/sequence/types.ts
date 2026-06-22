/**
 * Spec 25 — sequence engine types. A sequence is an ordered list of steps
 * (email / linkedin / wait); an enrollment is one contact's durable run through
 * it. The engine (./engine) is the conductor — it owns no sending, only routing.
 */

export type StepKind = "email" | "linkedin" | "wait";

export interface SequenceStep {
  id: string;
  kind: StepKind;
  /** Delay before this step runs, from the previous step's completion (or enrollment for step 0). */
  delayMs: number;
  /** email/linkedin: the variant slot to pull (spec 20). */
  slot?: string;
  /** linkedin sub-action. */
  linkedinAction?: "connect" | "message";
}

export interface SequenceDefinition {
  id: string;
  steps: SequenceStep[];
}

export type EnrollmentStatus = "active" | "halted" | "paused" | "completed";

export interface StepState {
  stepId: string;
  status: "pending" | "sent" | "skipped";
  sentAt?: number;
}

export interface Enrollment {
  id: string;
  contactId: string;
  sequenceId: string;
  status: EnrollmentStatus;
  /** Index into the sequence's steps. */
  currentStepIndex: number;
  /** Wall-clock time the current step becomes due (AC4). */
  dueAt: number;
  steps: StepState[];
  haltReason?: string;
  pauseReason?: string;
}

/** A QC-passed, approved variant the engine pulls and routes to a port. */
export interface SequenceVariant {
  id: string;
  subject?: string;
  body: string;
  evidence?: { id: string }[];
}
