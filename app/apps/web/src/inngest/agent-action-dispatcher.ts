/**
 * Agent action dispatcher (WS-7 completion).
 *
 * Every minute, claims due `agent_actions` (status='scheduled' AND
 * scheduledExecutionAt <= now AND not reversed) and executes them through
 * `executeAgentAction`. This is the consumer that was missing: without it,
 * approved actions (approve sets scheduledExecutionAt=now) and auto-grace email
 * sends sat 'scheduled' forever.
 *
 * Rows awaiting approval have NO scheduledExecutionAt, so the `lte(..., now())`
 * predicate skips them until `approveAgentAction` stamps the time.
 *
 * Claim is atomic: a conditional UPDATE to a transient 'executing' state
 * (status is a free-text column) guards against double-execution across
 * overlapping ticks; function concurrency is also pinned to 1.
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

export const agentActionDispatcher = inngest.createFunction(
  {
    id: "agent-action-dispatcher",
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }: { step: any }) => {
    const due = await step.run("find-due", async () => {
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
      const result = await step.run(`dispatch-${row.id}`, async () => {
        // Atomic claim — only the tick that flips 'scheduled' → 'executing' runs it.
        const won = await db
          .update(agentActions)
          .set({ status: "executing", updatedAt: new Date() })
          .where(and(eq(agentActions.id, row.id), eq(agentActions.status, "scheduled")))
          .returning({ id: agentActions.id });
        if (won.length === 0) return { claimed: false as const };

        try {
          const exec = await executeAgentAction(row.tenantId, {
            id: row.id,
            userId: row.userId,
            actionType: row.actionType,
            payload: (row.payload ?? {}) as Record<string, unknown>,
          });
          if (exec.ok) {
            await db
              .update(agentActions)
              .set({ status: "executed", executedAt: new Date(), updatedAt: new Date() })
              .where(eq(agentActions.id, row.id));
            return { claimed: true as const, ok: true as const, detail: exec.detail };
          }
          await db
            .update(agentActions)
            .set({ status: "failed", errorMessage: exec.error.slice(0, 500), updatedAt: new Date() })
            .where(eq(agentActions.id, row.id));
          return { claimed: true as const, ok: false as const, error: exec.error };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await db
            .update(agentActions)
            .set({ status: "failed", errorMessage: msg.slice(0, 500), updatedAt: new Date() })
            .where(eq(agentActions.id, row.id));
          return { claimed: true as const, ok: false as const, error: msg };
        }
      });

      if (result.claimed) {
        claimed++;
        if (result.ok) executed++;
        else failed++;
      }
    }

    logger.info("agent-action-dispatcher: tick", { due: due.length, claimed, executed, failed });
    return { claimed, executed, failed };
  },
);
