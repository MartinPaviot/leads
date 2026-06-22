/**
 * Spec 23 (AC2) — mailbox rotation + send window. Deterministic: rotation spreads
 * load across the authenticated pool, never selecting a mailbox without remaining
 * capacity; the send window keeps sends inside human-like hours.
 */

import type { SendMailbox } from "./port";

/**
 * Pick the mailbox to send the next message from: authenticated, with remaining
 * capacity, most-available first (spreads load and never exceeds a cap). Ties
 * break by id for determinism. Returns null when the pool is exhausted.
 */
export function selectSendMailbox(pool: SendMailbox[]): SendMailbox | null {
  const eligible = pool.filter((m) => m.authSendable && m.available > 0);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, m) =>
    m.available > best.available || (m.available === best.available && m.id < best.id) ? m : best,
  );
}

export interface SendWindow {
  /** Inclusive start hour (0–23), local to the window's timezone offset. */
  startHour: number;
  /** Exclusive end hour (0–23). */
  endHour: number;
  /** Days of week allowed (0=Sun..6=Sat). Default Mon–Fri. */
  days?: number[];
}

const DEFAULT_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri

/** Whether `at` falls inside the human-like send window. */
export function isWithinSendWindow(at: Date, window: SendWindow): boolean {
  const days = window.days ?? DEFAULT_DAYS;
  if (!days.includes(at.getUTCDay())) return false;
  const h = at.getUTCHours();
  return h >= window.startHour && h < window.endHour;
}
