/**
 * Spec 21 — sending identity, warmup and auth. Registry + DNS auth gate +
 * warmup-aware per-day capacity. Reuses the deliverability warmup ramp. See
 * _specs/21-sending-identity-warmup-auth/RECONCILE.md.
 */

export {
  type DnsAuthRecords,
  type AuthStatus,
  MIN_DKIM_BITS,
  verifyAuth,
  verifyDomainAuth,
} from "./auth";

export {
  type SendingProvider,
  type SendingMailbox,
  type IdentityRegistration,
  type MailboxCapacity,
  type CapacityReport,
  MAILBOXES_PER_DOMAIN,
  registerIdentity,
  isWarming,
  effectiveDailyCap,
  getSendableCapacity,
} from "./capacity";
