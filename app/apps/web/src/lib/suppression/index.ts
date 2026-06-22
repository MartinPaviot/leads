/**
 * Spec 22 — suppression list (send/enroll compliance hot path). See
 * _specs/22-suppression-list/RECONCILE.md.
 */

export {
  type SuppressionType,
  type SuppressionLevel,
  type SuppressionEntry,
  type SuppressionStore,
  type SuppressionTarget,
  type SuppressionHit,
  type OptOutEvent,
  type BouncePolicy,
  GLOBAL_SCOPE,
  normalizeEmail,
  normalizeDomain,
  domainOfEmail,
  suppressionKey,
  suppressionFromOptOut,
  suppressionFromBounce,
  addSuppression,
  isSuppressed,
  suppressed,
  InMemorySuppressionStore,
} from "./suppression";
