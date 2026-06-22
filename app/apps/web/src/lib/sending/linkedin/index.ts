/**
 * Spec 24 — provider-agnostic LinkedIn port + orchestration. See
 * _specs/24-linkedin-port-and-heyreach-adapter/RECONCILE.md.
 */

export {
  type LinkedInActionType,
  type LinkedInContact,
  type LinkedInRequest,
  type LinkedInResult,
  type LinkedInErrorKind,
  type LinkedInPort,
  LinkedInError,
} from "./port";

export {
  type LinkedInDailyLimits,
  DEFAULT_LINKEDIN_DAILY_LIMITS,
  remainingActions,
  withinDailyLimit,
} from "./limits";

export {
  type LinkedInRefuseReason,
  type LinkedInActionEvent,
  type LinkedInIdempotencyStore,
  type MeterOp,
  type LinkedInDeps,
  type LinkedInOutcome,
  runLinkedInAction,
} from "./linkedin";
