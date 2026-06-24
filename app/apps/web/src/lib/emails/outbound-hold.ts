/**
 * CLE-11 — the outbound undo window (de-facto unsend).
 *
 * A single seam every cancellable outbound chat/queue path can funnel through.
 * When a tenant has set `outboundUndoWindowSeconds > 0`, an outbound send whose
 * disposition is "execute" is written `status:"held"` with a `holdUntil` clock
 * instead of going straight to `queued`. The email-send-worker cron is the
 * DURABLE CLOCK: it releases matured holds (held → queued) and never sees
 * still-open ones. An undo within the window flips held → canceled before the
 * bytes leave.
 *
 * Invariants (design §6):
 *  - The hold can only DELAY or CANCEL a send, never bypass a guardrail —
 *    every existing send gate (test-mode, opt-out, plan-limit, mailbox
 *    window/cap) still runs at release/send time, after the hold.
 *  - A held send ends in exactly one terminal state (sent via release, or
 *    canceled via undo) — never both, never neither.
 *  - Every send-capable transition (release, cancel) is an atomic conditional
 *    UPDATE `WHERE status='held'` so concurrent passes cannot double-act.
 *
 * Window 0 (the default) makes this module inert: `enqueueOutbound` writes a
 * row byte-identical to today's queued insert.
 */

import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { TenantSettings } from "@/lib/config/tenant-settings";

/** Hard ceiling on the configurable window (1h) — anything larger is malformed. */
export const OUTBOUND_UNDO_WINDOW_MAX_SECONDS = 3600;

/**
 * Read the tenant's outbound undo window in seconds. FAIL-SAFE (AC-13): any
 * non-finite, negative, or over-cap value coerces to 0 (no hold). 0 is the
 * backwards-safe default — the whole feature is inert until a tenant opts in.
 */
export function readOutboundUndoWindowSeconds(
  settings: Pick<TenantSettings, "outboundUndoWindowSeconds"> | null | undefined,
): number {
  const raw = settings?.outboundUndoWindowSeconds;
  if (typeof raw !== "number") return 0;
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 0) return 0;
  if (raw > OUTBOUND_UNDO_WINDOW_MAX_SECONDS) return 0;
  // Coerce to a whole number of seconds.
  return Math.floor(raw);
}

export interface EnqueueOutboundInput {
  tenantId: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  contactId?: string | null;
  mailboxId?: string | null;
  campaignId?: string | null;
  enrollmentId?: string | null;
  stepNumber?: number | null;
  fromAddress?: string | null;
  /**
   * Free-form idempotency / dedup key written to the `message_id` column (e.g.
   * `draft:<id>` used by sequence-draft-to-outbound). Optional and defaults to
   * null, so when unset the held/queued row is byte-identical to today. This is
   * the seam that lets a dedup-bearing inserter route through enqueueOutbound
   * WITHOUT losing its select-then-insert idempotency (CLE-11 activation, #1).
   */
  messageId?: string | null;
  /**
   * Optional `quality_score` jsonb payload (the composite the email shipped at,
   * for the nightly back-test — P1-12). Passed straight through so a quality-
   * bearing inserter (sequence-draft-to-outbound) keeps its column when routed
   * through this seam. Typed `unknown` to avoid coupling the seam to the evals
   * shape; the jsonb column accepts it as-is.
   */
  qualityScore?: unknown;
  /**
   * Optional `error_message` passthrough. NOT an error — sendSequenceStep tags a
   * `[fallback:...]` prefix here so the review-queue UI can flag template-only
   * personalisation. Preserved when that path routes through this seam.
   */
  errorMessage?: string | null;
  /** Tenant settings — read for the window. */
  settings: Pick<TenantSettings, "outboundUndoWindowSeconds"> | null | undefined;
}

export interface EnqueueOutboundResult {
  id: string;
  held: boolean;
  holdUntil: Date | null;
}

/**
 * Enqueue an outbound email, honouring the tenant's undo window.
 *  - window 0  → status:"queued", queuedAt:now, holdUntil:null
 *                (byte-identical to today's queued insert; the cron picks it
 *                up unchanged — AC-12).
 *  - window >0 → status:"held", holdUntil:now+window, queuedAt:null
 *                (the cron skips it until the window passes, then releases it
 *                — AC-8/AC-9).
 *
 * NOT best-effort: the held row IS the send, so an insert failure must surface
 * to the caller (so it never reports "sent/scheduled" for a phantom send —
 * E-7). The caller writes the tool_call_events `outbound_send` snapshot keyed
 * on the returned id.
 */
export async function enqueueOutbound(
  input: EnqueueOutboundInput,
): Promise<EnqueueOutboundResult> {
  const windowSec = readOutboundUndoWindowSeconds(input.settings);
  const held = windowSec > 0;
  const holdUntil = held ? new Date(Date.now() + windowSec * 1000) : null;

  const [row] = await db
    .insert(outboundEmails)
    .values({
      tenantId: input.tenantId,
      contactId: input.contactId ?? null,
      campaignId: input.campaignId ?? null,
      enrollmentId: input.enrollmentId ?? null,
      mailboxId: input.mailboxId ?? null,
      stepNumber: input.stepNumber ?? null,
      fromAddress: input.fromAddress ?? "pending@rotation",
      toAddress: input.to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText ?? null,
      messageId: input.messageId ?? null,
      qualityScore: input.qualityScore ?? null,
      errorMessage: input.errorMessage ?? null,
      status: held ? "held" : "queued",
      queuedAt: held ? null : new Date(),
      holdUntil,
    })
    .returning({ id: outboundEmails.id });

  if (!row?.id) {
    // The insert returned nothing — treat as a hard failure so the caller does
    // not report a phantom send.
    throw new Error("enqueueOutbound: insert returned no row");
  }

  return { id: row.id, held, holdUntil };
}

export interface CancelHeldOutboundResult {
  canceled: boolean;
  reason?: string;
}

/**
 * Cancel a held outbound send within its window. Atomic + tenant-scoped: only a
 * row STILL `held` for this tenant can be canceled. If 0 rows match (the row
 * already moved to queued/sending/sent, or belongs to another tenant), report
 * `{ canceled:false, reason:"already_sending_or_sent" }` — the undo path then
 * refuses honestly (AC-11/E-5). This is the SAME atomic transition the cron's
 * release races against; exactly one of {cancel, release} can win (E-4).
 */
export async function cancelHeldOutbound(
  tenantId: string,
  outboundEmailId: string,
): Promise<CancelHeldOutboundResult> {
  const res = await db
    .update(outboundEmails)
    .set({
      status: "canceled",
      failedAt: new Date(),
      errorMessage: "Canceled by undo within the send window",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboundEmails.id, outboundEmailId),
        eq(outboundEmails.tenantId, tenantId),
        eq(outboundEmails.status, "held"),
      ),
    )
    .returning({ id: outboundEmails.id });

  if (res.length === 0) {
    return { canceled: false, reason: "already_sending_or_sent" };
  }
  return { canceled: true };
}
