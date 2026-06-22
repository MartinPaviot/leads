/**
 * Spec 20 — variant generation + deterministic QC gate. See
 * _specs/20-variant-generation-and-qc-gate/RECONCILE.md.
 */

export {
  type QcInput,
  type QcOptions,
  type QcChecks,
  type QcResult,
  type ApprovalMode,
  type ApprovalState,
  type PersonalizationLevel,
  countLinks,
  brandViolations,
  runQc,
  sendEligible,
} from "./qc";

export {
  type VariantAxis,
  type VariantDraft,
  type Variant,
  type VariantSetSpec,
  type GenerateVariantsDeps,
  generateVariants,
} from "./generate";
