/**
 * Outbound recipient guardrail — TEST MODE.
 *
 * A hard safety stop applied at every prospect-facing send chokepoint
 * (campaign worker, SMTP worker, interactive composer, chat action,
 * meeting follow-up). While test mode is ON — the DEFAULT — outbound
 * email may only reach an allowlisted address (our own team), never a
 * real prospect. It is defence in depth: it holds no matter how a send
 * is triggered, so wiring "launch the campaign" can never blast real
 * contacts while we are still testing.
 *
 * It does NOT touch transactional/auth mail (sign-up, password reset,
 * notifications, invites) — those go to our own users and run on
 * separate code paths that never import this module.
 *
 * Switch:
 *   OUTBOUND_TEST_MODE = "off"   → guardrail disabled, real sending.
 *   anything else / unset        → guardrail ON (fail-safe: a typo
 *                                  keeps it ON).
 *
 * Allowlist:
 *   Always includes the operator's own domain (elevay.dev). Add more
 *   bare addresses and/or @domains via OUTBOUND_TEST_ALLOWLIST
 *   (comma-separated). Matching is case-insensitive; an entry may be a
 *   full address ("you@team.com"), an "@domain", or a bare "domain".
 */

// The operator's own domain is always allowed in test mode so the team
// can receive every test send out of the box, even with no env set.
const ALWAYS_ALLOWED = ["elevay.dev"];

/** True when the guardrail is active (the default). */
export function isOutboundTestMode(): boolean {
  return (process.env.OUTBOUND_TEST_MODE ?? "on").trim().toLowerCase() !== "off";
}

/** Effective allowlist: the own domain plus any OUTBOUND_TEST_ALLOWLIST entries. */
export function outboundAllowlist(): string[] {
  const extra = (process.env.OUTBOUND_TEST_ALLOWLIST ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Dedupe while preserving the always-allowed entries first.
  return [...new Set([...ALWAYS_ALLOWED, ...extra])];
}

/** Pull the bare email out of a "Name <email>" header or a plain address. */
function bareEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

/**
 * Whether `toAddress` may be sent to right now. When test mode is off,
 * everything is allowed. When on, only allowlisted recipients pass.
 */
export function isRecipientAllowed(toAddress: string): boolean {
  if (!isOutboundTestMode()) return true;
  const email = bareEmail(toAddress);
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return false; // not a real address
  const domain = email.slice(at + 1);

  for (const entry of outboundAllowlist()) {
    if (!entry) continue;
    if (entry.startsWith("@")) {
      if (domain === entry.slice(1)) return true; // "@domain"
    } else if (entry.includes("@")) {
      if (email === entry) return true; // full address
    } else if (domain === entry) {
      return true; // bare "domain"
    }
  }
  return false;
}

/** Human-readable reason for a blocked send (stored on the failed row / returned to the UI). */
export function recipientBlockReason(toAddress: string): string {
  return (
    `Test mode is on — ${bareEmail(toAddress)} is not on the outbound allowlist, so nothing was sent. ` +
    `Add it via OUTBOUND_TEST_ALLOWLIST, or set OUTBOUND_TEST_MODE=off to send to real recipients.`
  );
}
