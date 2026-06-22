/**
 * Spec 25 — the sequence conductor. Deterministic enroll/advance state machine
 * over injected ports + guards (17/22/14/20/23/24/27). It routes steps to the
 * right port at the right time and stops on reply/opt-out; it owns no sending.
 *
 * `advance` performs at most one step transition per call (a durable-workflow
 * tick): it is a no-op before a step's delay, idempotent per (enrollmentId,
 * stepId), and pauses the whole sequence when the deliverability guard trips.
 *
 * Blast radius: sequence/* only.
 */

import type { Enrollment, SequenceDefinition, SequenceStep, SequenceVariant, StepState } from "./types";

export type EnrollRefuseReason = "ineligible" | "suppressed" | "collision-locked";

export interface EnrollResult {
  enrolled: boolean;
  enrollment?: Enrollment;
  refusedReason?: EnrollRefuseReason;
}

export interface SequenceDeps {
  /** spec-17 — verified-eligible for outreach. */
  isEligible: (contactId: string) => boolean | Promise<boolean>;
  /** spec-22 — suppressed. */
  isSuppressed: (contactId: string) => boolean | Promise<boolean>;
  /** spec-14 — acquire/release the anti-collision lock. */
  acquireLock: (contactId: string, enrollmentId: string) => Promise<boolean>;
  releaseLock: (contactId: string) => Promise<void>;
  /** spec-20 — a QC-passed, approved variant for the step, or null if none. */
  pullVariant: (step: SequenceStep) => Promise<SequenceVariant | null>;
  /** spec-23 — send an email step (idempotency handled by the port). */
  sendEmail: (step: SequenceStep, contactId: string, variant: SequenceVariant) => Promise<void>;
  /** spec-24 — run a linkedin step. */
  sendLinkedIn: (step: SequenceStep, contactId: string, variant: SequenceVariant) => Promise<void>;
  /** spec-27 — the deliverability guard tripped for this sequence. */
  isGuardTripped: (sequenceId: string) => boolean | Promise<boolean>;
  newId: () => string;
  now: () => number;
}

function pendingState(step: SequenceStep): StepState {
  return { stepId: step.id, status: "pending" };
}

/** AC1 — enroll only if eligible, not suppressed, and the lock is acquired. */
export async function enroll(contactId: string, sequence: SequenceDefinition, deps: SequenceDeps): Promise<EnrollResult> {
  if (!(await deps.isEligible(contactId))) return { enrolled: false, refusedReason: "ineligible" };
  if (await deps.isSuppressed(contactId)) return { enrolled: false, refusedReason: "suppressed" };

  const id = deps.newId();
  if (!(await deps.acquireLock(contactId, id))) return { enrolled: false, refusedReason: "collision-locked" };

  const now = deps.now();
  const firstDelay = sequence.steps[0]?.delayMs ?? 0;
  return {
    enrolled: true,
    enrollment: {
      id,
      contactId,
      sequenceId: sequence.id,
      status: "active",
      currentStepIndex: 0,
      dueAt: now + firstDelay,
      steps: sequence.steps.map(pendingState),
    },
  };
}

/** AC3 — halt this contact's sequence and release the lock (reply/opt-out). */
export async function haltSequence(enrollment: Enrollment, deps: Pick<SequenceDeps, "releaseLock">, reason = "replied"): Promise<Enrollment> {
  if (enrollment.status === "halted" || enrollment.status === "completed") return enrollment;
  await deps.releaseLock(enrollment.contactId);
  return { ...enrollment, status: "halted", haltReason: reason };
}

/** AC5 — pause the whole sequence (guard trip). Reversible. */
export function pauseSequence(enrollment: Enrollment, reason = "guard"): Enrollment {
  if (enrollment.status !== "active") return enrollment;
  return { ...enrollment, status: "paused", pauseReason: reason };
}

/** Resume a paused sequence. */
export function resumeSequence(enrollment: Enrollment): Enrollment {
  return enrollment.status === "paused" ? { ...enrollment, status: "active", pauseReason: undefined } : enrollment;
}

function nextDueAt(sequence: SequenceDefinition, nextIndex: number, now: number): number {
  const nextStep = sequence.steps[nextIndex];
  return now + (nextStep?.delayMs ?? 0);
}

/**
 * One conductor tick. Returns the (possibly unchanged) enrollment. No-op unless
 * the sequence is active, the guard is clear, and the current step is due.
 */
export async function advance(enrollment: Enrollment, sequence: SequenceDefinition, deps: SequenceDeps): Promise<Enrollment> {
  if (enrollment.status !== "active") return enrollment; // halted/paused/completed don't advance

  // AC5 — guard pauses the whole sequence.
  if (await deps.isGuardTripped(sequence.id)) return pauseSequence(enrollment, "guard");

  const now = deps.now();
  const i = enrollment.currentStepIndex;

  // Past the last step → completed, lock released.
  if (i >= sequence.steps.length) {
    await deps.releaseLock(enrollment.contactId);
    return { ...enrollment, status: "completed" };
  }

  // AC4 — never act before the delay.
  if (now < enrollment.dueAt) return enrollment;

  const step = sequence.steps[i];
  const stepState = enrollment.steps[i];

  // AC5 — idempotency: an already-sent step is never re-sent; just advance.
  if (stepState.status === "sent" || stepState.status === "skipped") {
    return advancedPast(enrollment, sequence, i, now, deps);
  }

  // wait steps only pass time.
  if (step.kind === "wait") {
    const steps = markStep(enrollment.steps, i, { status: "skipped" });
    return advancedPast({ ...enrollment, steps }, sequence, i, now, deps);
  }

  // AC2 — suppression is re-checked before each send; a mid-sequence opt-out halts.
  if (await deps.isSuppressed(enrollment.contactId)) {
    return haltSequence(enrollment, deps, "suppressed");
  }

  // AC2 — pull a QC-passed approved variant; without one the step waits (no advance).
  const variant = await deps.pullVariant(step);
  if (!variant) return enrollment;

  if (step.kind === "email") await deps.sendEmail(step, enrollment.contactId, variant);
  else await deps.sendLinkedIn(step, enrollment.contactId, variant);

  const steps = markStep(enrollment.steps, i, { status: "sent", sentAt: now });
  return advancedPast({ ...enrollment, steps }, sequence, i, now, deps);
}

function markStep(steps: StepState[], index: number, patch: Partial<StepState>): StepState[] {
  return steps.map((s, idx) => (idx === index ? { ...s, ...patch } : s));
}

/** Move the cursor past step `i`; complete + release the lock if that was the last step. */
async function advancedPast(
  enrollment: Enrollment,
  sequence: SequenceDefinition,
  i: number,
  now: number,
  deps: Pick<SequenceDeps, "releaseLock">,
): Promise<Enrollment> {
  const nextIndex = i + 1;
  if (nextIndex >= sequence.steps.length) {
    await deps.releaseLock(enrollment.contactId);
    return { ...enrollment, currentStepIndex: nextIndex, status: "completed" };
  }
  return { ...enrollment, currentStepIndex: nextIndex, dueAt: nextDueAt(sequence, nextIndex, now) };
}
