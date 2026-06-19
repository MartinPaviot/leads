/**
 * Sequence-aware follow-up step decision (INBOX-C09 core). Pure + unit-tested.
 *
 * The deterministic half of the follow-up generator: given the enrollment state
 * (current step, cadence, last touch, reply state), decide whether a follow-up is
 * due and which step is next — so we never nag a contact who replied, never run
 * past the sequence end, and respect the cadence. The follow-up DRAFT TEXT is the
 * LLM call (residual, sequence-aware via this decision).
 */

export interface FollowUpInput {
  /** Last step sent (0 = nothing sent yet). */
  currentStep: number;
  totalSteps: number;
  /** ms of our last outbound, or null if none. */
  lastTouchAt: number | null;
  /** Wait days before each step (cadenceDays[i] = wait before step i+1). */
  cadenceDays: number[];
  now: number;
  replied: boolean;
}

export interface FollowUpDecision {
  due: boolean;
  nextStep: number | null;
  reason: string;
}

export function nextFollowUp(i: FollowUpInput): FollowUpDecision {
  if (i.replied) {
    return { due: false, nextStep: null, reason: "replied — no follow-up needed" };
  }
  const nextStep = i.currentStep + 1;
  if (nextStep > i.totalSteps) {
    return { due: false, nextStep: null, reason: "sequence complete" };
  }
  if (i.lastTouchAt == null) {
    return { due: true, nextStep, reason: "no prior touch — send now" };
  }
  const waitDays = i.cadenceDays[i.currentStep] ?? 3;
  const dueAt = i.lastTouchAt + waitDays * 86_400_000;
  if (i.now >= dueAt) {
    return { due: true, nextStep, reason: `step ${nextStep} due` };
  }
  const daysLeft = Math.ceil((dueAt - i.now) / 86_400_000);
  return { due: false, nextStep, reason: `step ${nextStep} in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` };
}
