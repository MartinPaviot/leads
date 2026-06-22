/**
 * Spec 14 — anti-collision enrollment lock. A contact may be in exactly one
 * active sequence at a time across all campaigns; accounts hit by >1 active
 * campaign are surfaced for review. Distinct from lib/collision/* (rep-touch
 * attribution). See _specs/14-anti-collision/RECONCILE.md.
 */

export {
  type CollisionLock,
  InMemoryCollisionLock,
} from "./lock";
export {
  RedisCollisionLock,
  redisCollisionLockFromEnv,
} from "./redis-lock";
export {
  DEFAULT_LOCK_TTL_MS,
  type CollisionRecord,
  type AntiCollisionDeps,
  type ActiveEnrollment,
  type AccountOverlap,
  acquireEnrollmentLock,
  releaseEnrollmentLock,
  detectAccountOverlap,
} from "./collision";
