/**
 * P3 — outcome→learn loop for inbox replies (inbox-deal-closer roadmap).
 *
 * Closes a documented gap: a reply the founder sends (AI-drafted or typed by
 * hand) carries no link back to the flywheel, so a reply that gets a great
 * response never teaches the model anything. This reuses 100% existing,
 * tested primitives — no new tables, no new promotion mechanism:
 *
 *   send a reply → watchReplyOutcome() calls createOutcomeWatcher (existing
 *   F003 outcome tracking; actionType "draft_reply" already maps to
 *   expectedOutcome "email_reply" in lib/outcomes/create-watcher.ts)
 *     → outcomeDetectorCron resolves it from outboundEmails.repliedAt /
 *       replyClassification exactly as it already does today — ZERO changes
 *       to outcome-detector.ts
 *     → "outcome/resolved" fires (previously emitted, never consumed) →
 *       inngest/reply-flywheel-listener.ts reads the snapshot back off the
 *       resolved actionOutcomes row and, only for a genuinely positive
 *       reply, calls recordFlywheelCandidate() — the SAME insert-inactive-
 *       candidate-at-0.6 path PR #512 uses for founder approvals
 *       (lib/evals/flywheel.ts). promoteApprovedCandidates() (already run by
 *       the existing flywheel cron once "inbox-compose-reply" is registered
 *       in AGENT_REGISTRY) promotes it into the active few-shot pool, which
 *       applyLearnedContext() already injects into every future
 *       inbox-compose-reply draft (lib/ai/traced-ai.ts) — no change needed
 *       on the consumption side either.
 */

import { db } from "@/db";
import { activities } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { createOutcomeWatcher } from "./create-watcher";
import logger from "@/lib/observability/logger";

export const REPLY_FLYWHEEL_AGENT_ID = "inbox-compose-reply";
export const REPLY_FLYWHEEL_ACTION_TYPE = "draft_reply";

/**
 * Only a genuinely positive prospect reply is worth teaching the model from —
 * replied_positive (1.0), meeting_booked (0.9), deal_advanced (0.8). A
 * neutral reply (0.4) or a click/open (0.1–0.3) is not evidence the REPLY
 * TEXT itself worked, so it must not get promoted as a "this worked" example.
 * Pure + unit-tested so the bar is locked, not buried in the Inngest handler.
 */
export function shouldPromoteReplyOutcome(actionType: string, positivity: number): boolean {
  return actionType === REPLY_FLYWHEEL_ACTION_TYPE && positivity >= 0.8;
}

export interface ReplySnapshot {
  agentId: string;
  input: string;
  output: string;
}

const MAX_SNIPPET = 2000;

/**
 * What gets stored on the outcome watcher's entitySnapshot at send time, and
 * read back when the outcome resolves — so the listener needs no extra
 * queries beyond the one already-resolved actionOutcomes row. Pure.
 */
export function buildReplySnapshot(args: { inboundText: string | null; replyBody: string }): ReplySnapshot {
  return {
    agentId: REPLY_FLYWHEEL_AGENT_ID,
    input: (args.inboundText ?? "").trim().slice(0, MAX_SNIPPET),
    output: (args.replyBody ?? "").trim().slice(0, MAX_SNIPPET),
  };
}

/**
 * Best-effort: the most recent inbound message text for this contact, used
 * as the few-shot "situation" half of the pair. Null when there's none —
 * recordFlywheelCandidate already no-ops on an empty input, so this degrades
 * safely (the watcher still gets created; nothing is promoted from it).
 */
async function latestInboundText(tenantId: string, contactId: string): Promise<string | null> {
  const [row] = await db
    .select({ rawContent: activities.rawContent, summary: activities.summary })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, contactId),
        eq(activities.direction, "inbound"),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(1);
  return row?.rawContent || row?.summary || null;
}

/**
 * Watch a just-sent reply for a real-world outcome. Called fire-and-forget
 * from deliverInteractiveEmail right after a successful send — never blocks
 * or fails the send (best-effort, the same fail-soft contract as the
 * activity-log insert next to it).
 */
export async function watchReplyOutcome(params: {
  tenantId: string;
  contactId: string;
  replyBody: string;
}): Promise<void> {
  try {
    const inboundText = await latestInboundText(params.tenantId, params.contactId).catch(() => null);
    const snapshot = buildReplySnapshot({ inboundText, replyBody: params.replyBody });
    await createOutcomeWatcher({
      tenantId: params.tenantId,
      actionId: crypto.randomUUID(),
      entityType: "contact",
      entityId: params.contactId,
      actionType: REPLY_FLYWHEEL_ACTION_TYPE,
      triggerType: "inbox-reply",
      entitySnapshot: snapshot as unknown as Record<string, unknown>,
    });
  } catch (err) {
    logger.warn?.("reply-flywheel: watchReplyOutcome failed (non-fatal)", { err });
  }
}
