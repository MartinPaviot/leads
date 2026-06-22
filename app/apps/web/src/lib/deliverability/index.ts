/**
 * Spec 27 — deliverability guard. See _specs/27-deliverability-guard/RECONCILE.md.
 */

export {
  type MailboxProvider,
  type DeliverabilityThresholds,
  DEFAULT_THRESHOLDS,
  spamThreshold,
} from "./thresholds";

export {
  type DeliverabilityEventType,
  type DeliverabilityEvent,
  type Health,
  type GuardState,
  computeHealth,
  activeState,
  pause,
  shouldPause,
  resumeIfRecovered,
  rampUp,
  hardBounceAddresses,
} from "./guard";
