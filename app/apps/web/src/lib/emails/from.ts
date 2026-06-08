import { logger } from "@/lib/observability/logger";

/**
 * Single source of truth for the Resend "from" identity on transactional email
 * (verification, invites, password reset/change, welcome, notifications, ops).
 *
 * Set INVITE_FROM_ADDRESS to a sender on a domain VERIFIED in Resend, e.g.
 *   INVITE_FROM_ADDRESS="Elevay <no-reply@send.elevay.dev>"
 *
 * Until a domain is verified the Resend account is in testing mode: the only
 * sender Resend reliably accepts is `onboarding@resend.dev`, and the only
 * deliverable recipient is the account owner — every external recipient gets a
 * silent 403. That is why the dev fallback below is `onboarding@resend.dev`
 * (the address Resend accepts without a verified domain) rather than an
 * arbitrary @resend.dev alias, which Resend may reject outright.
 */
const DEV_FALLBACK = "Elevay <onboarding@resend.dev>";

/** Default transactional sender. */
export const EMAIL_FROM = process.env.INVITE_FROM_ADDRESS || DEV_FALLBACK;

/**
 * Welcome-email sender. Defaults to the standard transactional sender; set
 * WELCOME_FROM_ADDRESS to send from a founder-personal address (higher reply
 * rate) once that mailbox can actually receive replies.
 */
export const WELCOME_FROM = process.env.WELCOME_FROM_ADDRESS || EMAIL_FROM;

/** Internal / ops notifications (managed-sending requests, etc.). */
export const OPS_FROM = process.env.OPS_FROM_ADDRESS || EMAIL_FROM;

let warned = false;
/**
 * Log once if, in production, the transactional sender is still on Resend's
 * unverified test domain — in that state email only reaches the account owner.
 * Call from the hot send paths (signup verification, invites) so a misconfigured
 * prod deploy is loud in the logs instead of silently dropping mail.
 */
export function warnIfUnverifiedSender(): void {
  if (warned || process.env.NODE_ENV !== "production") return;
  warned = true;
  if (/@resend\.dev>?\s*$/i.test(EMAIL_FROM)) {
    logger.error(
      "[email] Transactional sender is still on the unverified resend.dev test " +
        "domain in production. Verification, invite, reset and notification emails " +
        "will only reach the Resend account owner. Set INVITE_FROM_ADDRESS to a " +
        'verified-domain sender (e.g. "Elevay <no-reply@send.elevay.dev>").'
    );
  }
}
