/**
 * WS-7 — reversible agent actions.
 *
 * API:
 *   recordAgentAction({ tenantId, userId, actionType, payload,
 *     reversibleForMs }) → insert row + return the action id
 *   reverseAgentAction({ actionId, reversedByUserId }) → flip status
 *     to 'reversed' and record a negative trustScore event
 *   markAgentActionExecuted({ actionId }) → flip to 'executed'
 *
 * Email-send flow uses a 60-second scheduled dispatch. The Inngest
 * job `agent-action-dispatcher` runs every minute, picks up
 * `scheduled` rows whose `scheduledExecutionAt` has passed AND
 * `reversedAt IS NULL`, and executes the payload.
 *
 * Errors are captured on the row (status='failed', errorMessage)
 * rather than thrown — the agent continues autonomously even when
 * one action fails.
 */

import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { recordAutonomyEvent } from "@/lib/guardrails/trust-score";
import logger from "@/lib/logger";

export const DEFAULT_EMAIL_GRACE_MS = 60_000;
export const DEFAULT_WRITE_REVERSIBLE_MS = 24 * 60 * 60 * 1000; // 24 h

export interface RecordActionInput {
  tenantId: string;
  userId?: string | null;
  actionType: string;
  payload: Record<string, unknown>;
  /** For sends, sets `scheduledExecutionAt = now + this`. For writes
   *  that happen immediately, leave 0 or undefined. */
  graceMs?: number;
  /** Until this timestamp, the user can still undo via
   *  `/api/agent-actions/:id/reverse`. Writes default to 24 h;
   *  sends default to the grace window. */
  reversibleForMs?: number;
}

export async function recordAgentAction(
  input: RecordActionInput,
): Promise<{ id: string }> {
  const now = Date.now();
  const graceMs = input.graceMs ?? 0;
  const reversibleForMs =
    input.reversibleForMs ?? (graceMs > 0 ? graceMs : DEFAULT_WRITE_REVERSIBLE_MS);

  const scheduledAt = graceMs > 0 ? new Date(now + graceMs) : null;
  const reversibleUntil = new Date(now + reversibleForMs);

  const [row] = await db
    .insert(agentActions)
    .values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      actionType: input.actionType,
      payload: input.payload,
      scheduledExecutionAt: scheduledAt,
      reversibleUntil,
      status: graceMs > 0 ? "scheduled" : "executed",
      executedAt: graceMs > 0 ? null : new Date(),
    })
    .returning({ id: agentActions.id });

  return { id: row.id };
}

export async function reverseAgentAction(params: {
  actionId: string;
  reversedByUserId: string;
  tenantId: string;
}): Promise<
  | { status: "reversed"; previousStatus: "scheduled" | "executed" }
  | { status: "too-late"; reason: string }
  | { status: "not-found" }
> {
  const [row] = await db
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.id, params.actionId),
        eq(agentActions.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  if (!row) return { status: "not-found" };

  if (row.reversedAt) {
    return { status: "too-late", reason: "already reversed" };
  }
  if (
    row.reversibleUntil &&
    row.reversibleUntil.getTime() < Date.now() &&
    row.status === "executed"
  ) {
    return { status: "too-late", reason: "reversibility window expired" };
  }
  if (row.status === "failed") {
    return { status: "too-late", reason: "action failed, nothing to reverse" };
  }

  await db
    .update(agentActions)
    .set({
      status: "reversed",
      reversedAt: new Date(),
      reversedByUserId: params.reversedByUserId,
      updatedAt: new Date(),
    })
    .where(eq(agentActions.id, params.actionId));

  // Negative trust signal — the user just overrode the agent.
  await recordAutonomyEvent({
    tenantId: params.tenantId,
    userId: params.reversedByUserId,
    eventType: "undone_after_send",
    entityRef: `agent_action:${params.actionId}`,
    reason: `Action ${row.actionType} reversed by user`,
  }).catch((err) =>
    logger.warn("agent-actions: trust-event write failed", { err }),
  );

  return {
    status: "reversed",
    previousStatus: row.status === "scheduled" ? "scheduled" : "executed",
  };
}

export async function markAgentActionExecuted(actionId: string): Promise<void> {
  await db
    .update(agentActions)
    .set({
      status: "executed",
      executedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentActions.id, actionId));
}

export async function markAgentActionFailed(
  actionId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(agentActions)
    .set({
      status: "failed",
      errorMessage: errorMessage.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(agentActions.id, actionId));
}

/**
 * Returns scheduled actions whose scheduled time has passed AND
 * haven't been reversed. Used by the Inngest dispatcher cron.
 */
export async function claimDueActions(limit = 100): Promise<
  Array<{ id: string; tenantId: string; actionType: string; payload: unknown }>
> {
  const rows = await db
    .select({
      id: agentActions.id,
      tenantId: agentActions.tenantId,
      actionType: agentActions.actionType,
      payload: agentActions.payload,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.status, "scheduled"),
        isNull(agentActions.reversedAt),
        lte(agentActions.scheduledExecutionAt, sql`now()`),
      ),
    )
    .limit(limit);
  return rows;
}

/** Recent agent-action history — consumed by the Settings → Agent
 *  action history page (deferred UI, but endpoint is stable). */
export async function getRecentActions(tenantId: string, limit = 50) {
  return db
    .select()
    .from(agentActions)
    .where(eq(agentActions.tenantId, tenantId))
    .orderBy(sql`${agentActions.createdAt} DESC`)
    .limit(limit);
}
