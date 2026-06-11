/**
 * Sequence-draft state machine (P0-1 task 1.1).
 *
 * Enforces the lifecycle :
 *
 *   pending_approval ──approve──→ approved ──worker──→ sent
 *           │
 *           ├──reject──→ rejected (terminal)
 *           ├──cron 24h─→ expired (terminal)
 *           └──edit (content changes, status stays pending_approval)
 *
 * Pure functions — no IO, no DB, no side effects. The API routes
 * (`/api/sequences/drafts/:id/{approve|reject|edit}`) validate
 * incoming actions through `canTransition()` before calling
 * `db.update(...)`.
 *
 * Why a state machine helper instead of inline `if (status === ...)` :
 *  - One source of truth for the lifecycle, easy to extend.
 *  - Unit-testable independently of the DB — every action × every
 *    starting state covered.
 *  - The `nextState` return is what gets persisted, so even `edit`
 *    actions get an audited transition object that telemetry can
 *    consume uniformly.
 */

export type DraftStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired"
  | "sent";

export type DraftAction =
  | "approve"
  | "reject"
  | "edit"
  | "expire"
  | "mark_sent"
  | "recall";

export interface TransitionResult {
  allowed: boolean;
  nextStatus: DraftStatus;
  /** Human-readable reason when `allowed === false`. */
  reason?: string;
}

/**
 * Returns whether the action can be applied to a draft currently in
 * `from`, and the resulting status. When `allowed: false`, the
 * caller must respond 409 with the supplied reason.
 *
 * Note : `edit` deliberately keeps status at `pending_approval` —
 * editing content doesn't transition the lifecycle. We still route
 * through here so callers don't bypass the state-machine check.
 */
export function canTransition(
  from: DraftStatus,
  action: DraftAction,
): TransitionResult {
  switch (action) {
    case "approve":
      if (from === "pending_approval") {
        return { allowed: true, nextStatus: "approved" };
      }
      return {
        allowed: false,
        nextStatus: from,
        reason: `Cannot approve a draft in '${from}' state — only 'pending_approval' is approvable`,
      };

    case "reject":
      if (from === "pending_approval") {
        return { allowed: true, nextStatus: "rejected" };
      }
      return {
        allowed: false,
        nextStatus: from,
        reason: `Cannot reject a draft in '${from}' state — only 'pending_approval' is rejectable`,
      };

    case "edit":
      if (from === "pending_approval") {
        // Edit doesn't change status, but it IS a guarded action :
        // editing an approved-and-queued draft would race with the
        // sender worker. Status check above blocks it.
        return { allowed: true, nextStatus: "pending_approval" };
      }
      return {
        allowed: false,
        nextStatus: from,
        reason: `Cannot edit a draft in '${from}' state — only 'pending_approval' is editable`,
      };

    case "expire":
      if (from === "pending_approval") {
        return { allowed: true, nextStatus: "expired" };
      }
      // Expiry on a non-pending draft is a no-op, not an error —
      // the cron sweeps blindly and we want it to be idempotent.
      return {
        allowed: false,
        nextStatus: from,
        reason: `Draft is already in terminal state '${from}'`,
      };

    case "mark_sent":
      if (from === "approved") {
        return { allowed: true, nextStatus: "sent" };
      }
      return {
        allowed: false,
        nextStatus: from,
        reason: `Only 'approved' drafts can be marked sent (was '${from}')`,
      };

    case "recall":
      // System-side recall: a cited source died between approval and
      // send (the dispatch bridge re-verifies personalization URLs at
      // T-0). The draft returns to the founder's review queue with a
      // reason instead of sending a dead citation. Idempotent on any
      // other state, like `expire` — the bridge may race a resend.
      if (from === "approved") {
        return { allowed: true, nextStatus: "pending_approval" };
      }
      return {
        allowed: false,
        nextStatus: from,
        reason: `Only 'approved' drafts can be recalled (was '${from}')`,
      };
  }
}

/**
 * True iff the draft is in a state that admits no further action.
 * Used by the UI to filter the review queue and by analytics to
 * count terminal-rejection rates.
 */
export function isTerminal(status: DraftStatus): boolean {
  return status === "rejected" || status === "expired" || status === "sent";
}

/**
 * Validate a user-supplied rejection reason. Per the spec :
 *   3 ≤ length ≤ 200 chars after trim.
 *
 * Returns the trimmed string on success, an Error message string on
 * failure (caller responds 400 with the message).
 */
export function validateRejectionReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Rejection reason must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 3) {
    return {
      ok: false,
      error: "Rejection reason must be at least 3 characters",
    };
  }
  if (trimmed.length > 200) {
    return {
      ok: false,
      error: "Rejection reason must be at most 200 characters",
    };
  }
  return { ok: true, reason: trimmed };
}
