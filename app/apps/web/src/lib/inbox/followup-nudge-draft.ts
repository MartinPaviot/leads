/**
 * P2 (inbox deal-closer roadmap) — proactive follow-up nudges, the DB-touching
 * orchestrator. Pure decision logic lives in followup-nudge.ts (locked by
 * tests); this module wires it to the real inbox read-model + the existing
 * safe nudge generator (compose-reply.ts mode:"nudge") and persists the
 * result. Called once per (tenant, user) by inngest/followup-nudge-cron.ts —
 * the inbox is personal (lib/inbox/user-scope.ts), so there is no tenant-wide
 * shortcut.
 *
 * Every draft this writes starts at status "pending_review". Nothing in this
 * file ever sends an email — sending only happens via an explicit founder
 * action against /api/inbox/followups/[id]/send (which routes through
 * deliverInteractiveEmail, so the P3/P4 send-time protections apply
 * automatically). Fail-closed throughout: a generator failure, a DB error on
 * one conversation, or an empty draft body all just skip that conversation —
 * they never throw out of the per-user pass (one bad thread must not block
 * the rest of a user's due follow-ups).
 */

import { db } from "@/db";
import { inboxFollowupNudges } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { loadConversationRows } from "./load";
import { getInboxScope, scopeConversationRows } from "./user-scope";
import { buildConversations, type Conversation } from "./conversations";
import { isFollowupDue } from "./followup-due";
import {
  shouldDraftNudge,
  isNudgeStale,
  computeNudgeExpiresAt,
  escalationGuidance,
  type ExistingNudgeRow,
} from "./followup-nudge";
import { buildReplyInstructions } from "./reply-instructions";
import { composeReply } from "./compose-reply";
import type { ThreadMessage } from "./summarize-thread";
import { logger } from "@/lib/observability/logger";

export interface NudgeDraftResult {
  drafted: number;
  expired: number;
}

function toThreadMessages(c: Conversation): ThreadMessage[] {
  return c.messages.map((m) => ({ direction: m.direction, from: m.from, body: m.body, at: m.at }));
}

/** Mark every still-pending row that's gone stale (live state moved on) or
 *  hit its hard expiry as "expired". Returns the count flipped. */
async function reconcileStaleNudges(
  tenantId: string,
  userId: string,
  byKey: Map<string, Conversation>,
): Promise<number> {
  const pending = await db
    .select({ id: inboxFollowupNudges.id, conversationKey: inboxFollowupNudges.conversationKey, stage: inboxFollowupNudges.stage, expiresAt: inboxFollowupNudges.expiresAt })
    .from(inboxFollowupNudges)
    .where(
      and(
        eq(inboxFollowupNudges.tenantId, tenantId),
        eq(inboxFollowupNudges.userId, userId),
        eq(inboxFollowupNudges.status, "pending_review"),
      ),
    );
  if (pending.length === 0) return 0;

  const now = Date.now();
  const staleIds = pending
    .filter((row) => {
      const live = byKey.get(row.conversationKey)?.followup ?? null;
      return isNudgeStale(row.stage, live) || now >= row.expiresAt.getTime();
    })
    .map((row) => row.id);
  if (staleIds.length === 0) return 0;

  await db
    .update(inboxFollowupNudges)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(inboxFollowupNudges.tenantId, tenantId),
        eq(inboxFollowupNudges.userId, userId),
        inArray(inboxFollowupNudges.id, staleIds),
      ),
    );
  return staleIds.length;
}

/** Draft a nudge for every due conversation that doesn't already have one at
 *  its current stage. Returns the count actually drafted (skips: not due,
 *  already drafted, or the generator came back empty). */
async function draftDueNudges(
  tenantId: string,
  userId: string,
  scope: Awaited<ReturnType<typeof getInboxScope>>,
  due: Conversation[],
): Promise<number> {
  if (due.length === 0) return 0;

  const dueKeys = due.map((c) => c.key);
  const existingRows = await db
    .select({ conversationKey: inboxFollowupNudges.conversationKey, stage: inboxFollowupNudges.stage })
    .from(inboxFollowupNudges)
    .where(
      and(
        eq(inboxFollowupNudges.tenantId, tenantId),
        eq(inboxFollowupNudges.userId, userId),
        inArray(inboxFollowupNudges.conversationKey, dueKeys),
      ),
    );
  const existingByKey = new Map<string, ExistingNudgeRow[]>();
  for (const r of existingRows) {
    const arr = existingByKey.get(r.conversationKey) ?? [];
    arr.push(r);
    existingByKey.set(r.conversationKey, arr);
  }

  let drafted = 0;
  for (const c of due) {
    if (!shouldDraftNudge(c.followup, existingByKey.get(c.key) ?? [])) continue;
    const stage = c.followup!.stage;
    try {
      const { instructions, context } = await buildReplyInstructions(tenantId, userId, c, scope, "nudge");
      const guided = [instructions, escalationGuidance(stage)].filter(Boolean).join("\n\n");
      const draft = await composeReply(toThreadMessages(c), { instructions: guided, context, mode: "nudge" });
      if (!draft.text.trim()) continue; // fail-closed: same contract as compose-reply.ts

      const now = Date.now();
      await db.insert(inboxFollowupNudges).values({
        tenantId,
        userId,
        conversationKey: c.key,
        contactId: c.contactId,
        toAddress: c.fromAddress,
        subject: draft.subject.trim() || c.subject || "Following up",
        bodyText: draft.text,
        stage,
        status: "pending_review",
        generatedAt: new Date(now),
        expiresAt: computeNudgeExpiresAt(now),
      });
      drafted++;
    } catch (err) {
      // A unique-index race (another tick already drafted this stage) or any
      // other per-conversation failure must not block the rest of the user's
      // due conversations.
      logger.warn?.("followup-nudge-draft: skip conversation (non-fatal)", {
        tenantId,
        userId,
        conversationKey: c.key,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return drafted;
}

/**
 * The full per-user pass the cron calls: reconcile stale pending drafts, then
 * draft any newly-due ones. No-ops (0/0) for a user with no connected mailbox.
 */
export async function draftAndReconcileNudgesForUser(tenantId: string, userId: string): Promise<NudgeDraftResult> {
  const scope = await getInboxScope(tenantId, userId);
  if (!scope.hasMailbox) return { drafted: 0, expired: 0 };

  const rows = scopeConversationRows(await loadConversationRows(tenantId), scope);
  const conversations = buildConversations(rows);
  const byKey = new Map(conversations.map((c) => [c.key, c]));

  const expired = await reconcileStaleNudges(tenantId, userId, byKey);
  const due = conversations.filter((c) => isFollowupDue(c.followup));
  const drafted = await draftDueNudges(tenantId, userId, scope, due);

  return { drafted, expired };
}
