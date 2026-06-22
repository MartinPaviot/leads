/**
 * Spec 33 — lawful basis gate. See _specs/33-lawful-basis-gate/RECONCILE.md.
 */

export {
  type BasisType,
  type SourcePolicy,
  type Jurisdiction,
  SOURCE_POLICY,
  JURISDICTION_BASES,
  sourcePolicy,
  acceptableBases,
  requiresOptOut,
} from "./policy";

export {
  type LawfulBasis,
  type ComplianceContact,
  type BlockReason,
  type LawfulBasisResult,
  type MessageComplianceResult,
  assertLawfulBasis,
  hasOptOut,
  assertMessageOptOut,
} from "./gate";
