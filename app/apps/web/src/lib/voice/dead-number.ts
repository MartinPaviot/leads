/**
 * Dead-number classification for the call-list cadence (T7, _specs/call-lists).
 *
 * Only an UNAMBIGUOUS "this number does not exist / is invalid" Twilio ErrorCode
 * terminates a target (→ exhausted via the wrong_number outcome, never
 * re-listed). Everything else — busy, no-answer, plain failed, and SIP 404
 * (which Twilio frequently maps to the no-answer CallStatus, not a dead number)
 * — stays a normal miss handled by the cadence / the rep's disposition.
 *
 * R8.4: when uncertain, default to NRP. A wasted retry beats wrongly killing a
 * good contact, so this set is deliberately SMALL and conservative.
 *
 * Confirmed against the Twilio error dictionary (twilio.com/docs/api/errors,
 * 2026-06-15):
 *   13224 — "Dial: Twilio does not support calling this number or the number is invalid"
 *   21211 — "Invalid 'To' Phone Number"
 * Deliberately EXCLUDED: 13225 ("Call blocked by Twilio" — fraud/regulatory; the
 * number itself may be perfectly valid). Extend ONLY with codes whose meaning is
 * unambiguously "the number does not exist", ideally confirmed against real call
 * logs.
 */

export const DEAD_NUMBER_ERROR_CODES: ReadonlySet<string> = new Set(["13224", "21211"]);

/** True only for a Twilio ErrorCode that unambiguously means the number is dead. */
export function isDeadNumberErrorCode(code: string | number | null | undefined): boolean {
  if (code === null || code === undefined) return false;
  return DEAD_NUMBER_ERROR_CODES.has(String(code).trim());
}

/** Twilio child-leg CallStatus values that are terminal (the call is over). */
export const TERMINAL_CALL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

export function isTerminalCallStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_CALL_STATUSES.has(status);
}
