/**
 * Undo-send + send-later timing (INBOX-C11 core). Pure + unit-tested.
 *
 * computeSendAt resolves a natural-language schedule ("in 5m", "tomorrow 9am",
 * "next monday") to a concrete timestamp, reusing the shared INBOX-T05 parser.
 * The undo window helpers gate the brief "Undo" affordance after a send is
 * queued. The actual scheduled-send worker reuses the existing exactly-once claim
 * (residual); this is just the timing math.
 */

import { parseWhen } from "./parse-when";

export const DEFAULT_UNDO_SECONDS = 30;

export function computeSendAt(input: string, now: Date = new Date()): Date | null {
  return parseWhen(input, now);
}

/** Still inside the undo grace period (send not yet released to the transport). */
export function isWithinUndoWindow(
  sentAtMs: number,
  nowMs: number,
  windowSeconds = DEFAULT_UNDO_SECONDS,
): boolean {
  return nowMs >= sentAtMs && nowMs - sentAtMs < windowSeconds * 1000;
}

export function undoDeadline(sentAtMs: number, windowSeconds = DEFAULT_UNDO_SECONDS): number {
  return sentAtMs + windowSeconds * 1000;
}
