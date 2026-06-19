/**
 * CLE-09 — the call-mode action IDs we INTENTIONALLY do NOT register. Live WebRTC
 * telephony + mic capture + in-call disposition are human-bound (README §2:
 * "l'agent prépare et navigue, l'humain exécute"); buying a number spends real
 * money and is admin-only. The agent PREPARES the call; the human PLACES and
 * DISPOSITIONS it, and BUYS numbers. A test (call-mode-actions.test.tsx) asserts
 * the registered id set is disjoint from this — adding any of these would be a
 * boundary breach.
 *
 * Kept in this `_`-prefixed (router-ignored) module rather than in page.tsx: a
 * Next.js App Router `page.tsx` may only export the default component + the route
 * config allowlist, so a named export there fails `next build`'s page-type check.
 */
export const CALLMODE_HUMAN_BOUND_IDS = [
  "callMode.call",
  "callMode.dial",
  "callMode.hangUp",
  "callMode.dropVoicemail",
  "callMode.disposition",
  "callMode.callAgain",
  "callMode.skip",
  "callMode.buyNumber",
] as const;
