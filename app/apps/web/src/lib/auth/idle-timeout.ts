/**
 * Inactivity auto-logout — config + pure state machine (no DOM, no React, so
 * it's trivially unit-testable).
 *
 * Why client-side: the session is a stateless JWT cookie (8h absolute, 1h
 * rolling — see `auth.ts`), and the app polls `/api/notifications` every ~30s,
 * so a short server `maxAge` would be kept alive forever by background traffic.
 * A real idle timeout therefore has to watch genuine user interaction in the
 * browser; this module holds the thresholds + the active/warning/expired
 * decision, and `components/idle-logout.tsx` wires it to events + signOut().
 */

// ── Tune here ────────────────────────────────────────────────────────────
/** Sign the user out after this much inactivity. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
/** Show the "still there?" warning this long before the cut-off. */
export const IDLE_WARNING_MS = 60 * 1000; // 60 seconds
// ─────────────────────────────────────────────────────────────────────────

/** localStorage key holding the last-activity epoch ms, shared across tabs so
 *  activity in any tab keeps every tab alive. */
export const IDLE_STORAGE_KEY = "elevay.idle.last";
/** localStorage key written on idle logout so other tabs follow. */
export const IDLE_LOGOUT_KEY = "elevay.idle.loggedout";

export type IdlePhase = "active" | "warning" | "expired";

/** Decide the phase from how long the user has been idle (ms). */
export function idlePhase(
  idleMs: number,
  timeoutMs: number = IDLE_TIMEOUT_MS,
  warningMs: number = IDLE_WARNING_MS,
): IdlePhase {
  if (idleMs >= timeoutMs) return "expired";
  if (idleMs >= timeoutMs - warningMs) return "warning";
  return "active";
}

/** Whole seconds left before logout (clamped at 0) — drives the countdown. */
export function secondsUntilLogout(
  idleMs: number,
  timeoutMs: number = IDLE_TIMEOUT_MS,
): number {
  return Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000));
}
