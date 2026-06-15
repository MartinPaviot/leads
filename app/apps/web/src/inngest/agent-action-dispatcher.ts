/**
 * Agent action dispatcher (WS-7 completion).
 *
 * Two paths, one execution helper:
 *
 *  1. PRIMARY — event-driven (`agentActionOnScheduled`). When an action
 *     becomes due, `lib/agents/agent-actions.ts` emits
 *     `agent/action.scheduled` (on grace-send creation and on approval).
 *     We sleep durably until its execution time, then claim + execute
 *     exactly that row. No polling, zero idle ticks, sub-second latency
 *     once due. A reversal during the sleep is handled by the atomic
 *     claim (the row is no longer `scheduled`).
 *
 *  2. BACKSTOP — low-frequency sweep (`agentActionDispatcher`, every 15
 *     min). Catches rows whose event was lost or that were created
 *     outside the chokepoint (e.g. the backfill script). At one-tenant
 *     scale this almost always finds nothing; it exists for correctness,
 *     not throughput.
 *
 * Exactly-once: the atomic claim (UPDATE ... WHERE id AND
 * status='scheduled' RETURNING) guarantees a given action runs once even
 * if the event handler and the sweep race — whichever flips the row
 * first wins; the loser no-ops on a 0-row claim. Function concurrency is
 * a budget cap, NOT the safety mechanism.
 *
 * Safety: email goes through deliverInteractiveEmail, which enforces
 * OUTBOUND_TEST_MODE — no real prospect is reached while test-mode is on.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { executeAgentAction } from "@/lib/agents/action-executors";
import logger from "@/lib/observability/logger";

const BATCH = 50;

type DueRow = {
  id: string;
  tenantId: string;
  userId: string | null;
  actionType: string;
  payload: unknown;
};

type DispatchResult =
  | { claimed: false }
  | { claimed: true; ok: true; detail?: unknown }
  | { claimed: true; ok: false; error: string };

/**
 * Atomic claim + execute of a single scheduled action. The claim flips
 * 'scheduled' → 'executed' conditionally; a 0-row result means someone
 * else already claimed it (or it was reversed) and we no-op. On executor
 * failure the row is flipped to 'failed' with the message — never thrown,
 * so the agent keeps running autonomously.
 */
async function claimAndExecuteAction(row: DueRow): Promise<DispatchResult> {
  const won = await db
    .update(agentActions)
    .set({ status: "executed", executedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agentActions.id, row.id), eq(agentActions.status, "scheduled")))
    .returning({ id: agentActions.id });
  if (won.length === 0) return { claimed: false };

  try {
    const exec = await executeAgentAction(row.tenantId, {
      id: row.id,
      userId: row.userId,
      actionType: row.actionType,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    });
    if (exec.ok) {
      // Already marked 'executed' by the claim above.
      return { claimed: true, ok: true, detail: exec.detail };
    }
    await db
      .update(agentActions)
      .set({ status: "failed", errorMessage: exec.error.slice(0, 500), updatedAt: new Date() })
      .where(eq(agentActions.id, row.id));
    return { claimed: true, ok: false, error: exec.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(agentActions)
      .set({ status: "failed", errorMessage: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(agentActions.id, row.id));
    return { claimed: true, ok: false, error: msg };
  }
}

/**
 * PRIMARY path — fires once per scheduled/approved action. Replaces the
 * old every-minute poll. Sleeps durably until the action's execution
 * time (immediate for approvals; +grace for sends), then claims it.
 */
export const agentActionOnScheduled = inngest.createFunction(
  {
    id: "agent-action-on-scheduled",
    // The atomic claim — not this cap — provides exactly-once. Bounded at
    // 5 to stay within the Hobby concurrency budget; raise on Pro.
    concurrency: [{ limit: 5 }],
    retries: 2,
    triggers: [{ event: "agent/action.scheduled" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const actionId: string | undefined = event.data?.actionId;
    if (!actionId) {
      logger.warn("agent-action-on-scheduled: missing actionId", { data: event.data });
      return { dispatched: false, reason: "missing-action-id" };
    }

    // Durable sleep until the action is due. sleepUntil returns
    // immediately if the timestamp is already in the past (approvals).
    const runAt = event.data?.runAt ? new Date(event.data.runAt) : new Date();
    await step.sleepUntil("until-due", runAt);

    const row: DueRow & { status: string; reversedAt: Date | null } | null =
      await step.run("load-action", async () => {
        const [r] = await db
          .select({
            id: agentActions.id,
            tenantId: agentActions.tenantId,
            userId: agentActions.userId,
            actionType: agentActions.actionType,
            payload: agentActions.payload,
            status: agentActions.status,
            reversedAt: agentActions.reversedAt,
          })
          .from(agentActions)
          .where(eq(agentActions.id, actionId))
          .limit(1);
        return r ?? null;
      });

    // Reversed or already handled during the grace window → nothing to do.
    if (!row || row.status !== "scheduled" || row.reversedAt) {
      return { dispatched: false, reason: row ? `status:${row.status}` : "not-found" };
    }

    const result = await step.run("dispatch", () => claimAndExecuteAction(row));
    return { dispatched: result.claimed, ok: result.claimed ? result.ok : false };
  },
);

/**
 * BACKSTOP path — low-frequency safety-net sweep. Was every minute; now
 * every 15 minutes because the event path carries the load. Picks up any
 * due rows the event path missed and runs them through the same claim.
 */
export const agentActionDispatcher = inngest.createFunction(
  {
    id: "agent-action-dispatcher",
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }: { step: any }) => {
    const due: DueRow[] = await step.run("find-due", async () => {
      return db
        .select({
          id: agentActions.id,
          tenantId: agentActions.tenantId,
          userId: agentActions.userId,
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
        .limit(BATCH);
    });

    if (due.length === 0) return { claimed: 0, executed: 0, failed: 0 };

    let executed = 0;
    let failed = 0;
    let claimed = 0;

    for (const row of due) {
      const result = await step.run(`dispatch-${row.id}`, () => claimAndExecuteAction(row));
      if (result.claimed) {
        claimed++;
        if (result.ok) executed++;
        else failed++;
      }
    }

    logger.info("agent-action-dispatcher: sweep", { due: due.length, claimed, executed, failed });
    return { claimed, executed, failed };
  },
);
