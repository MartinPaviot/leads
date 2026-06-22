/**
 * Spec 25 — sequence engine (the conductor). See _specs/25-sequence-engine/RECONCILE.md.
 */

export {
  type StepKind,
  type SequenceStep,
  type SequenceDefinition,
  type EnrollmentStatus,
  type StepState,
  type Enrollment,
  type SequenceVariant,
} from "./types";

export {
  type EnrollRefuseReason,
  type EnrollResult,
  type SequenceDeps,
  enroll,
  advance,
  haltSequence,
  pauseSequence,
  resumeSequence,
} from "./engine";
