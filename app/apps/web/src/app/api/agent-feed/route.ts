/**
 * F010 — Agent Activity Feed API
 *
 * Returns the agent's recent actions and decisions for the feed-first UI.
 * Combines agent_reactions (decisions) with agent_actions (executions).
 */

import { db } from "@/db";
import { agentReactions, agentActions, agentWorkItems } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const [reactions, pendingActions, workItems] = await Promise.all([
    db
      .select({
        id: agentReactions.id,
        trigger: agentReactions.trigger,
        entityType: agentReactions.entityType,
        entityId: agentReactions.entityId,
        contextSnapshot: agentReactions.contextSnapshot,
        decision: agentReactions.decision,
        actionsTaken: agentReactions.actionsTaken,
        actionsDeferred: agentReactions.actionsDeferred,
        processingTimeMs: agentReactions.processingTimeMs,
        createdAt: agentReactions.createdAt,
      })
      .from(agentReactions)
      .where(eq(agentReactions.tenantId, authCtx.tenantId))
      .orderBy(desc(agentReactions.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({
        id: agentActions.id,
        actionType: agentActions.actionType,
        payload: agentActions.payload,
        status: agentActions.status,
        createdAt: agentActions.createdAt,
        reversibleUntil: agentActions.reversibleUntil,
      })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.tenantId, authCtx.tenantId),
          eq(agentActions.status, "scheduled"),
        ),
      )
      .orderBy(desc(agentActions.createdAt))
      .limit(10),

    db
      .select({
        id: agentWorkItems.id,
        entityType: agentWorkItems.entityType,
        entityId: agentWorkItems.entityId,
        entityLabel: agentWorkItems.entityLabel,
        strategy: agentWorkItems.strategy,
        priority: agentWorkItems.priority,
        nextAction: agentWorkItems.nextAction,
        nextActionDetail: agentWorkItems.nextActionDetail,
        nextActionAt: agentWorkItems.nextActionAt,
      })
      .from(agentWorkItems)
      .where(
        and(
          eq(agentWorkItems.tenantId, authCtx.tenantId),
          eq(agentWorkItems.status, "active"),
        ),
      )
      .orderBy(
        sql`CASE
          WHEN ${agentWorkItems.priority} = 'critical' THEN 0
          WHEN ${agentWorkItems.priority} = 'high' THEN 1
          WHEN ${agentWorkItems.priority} = 'medium' THEN 2
          ELSE 3
        END`,
      )
      .limit(10),
  ]);

  return Response.json({
    reactions,
    pendingActions,
    workItems,
  });
}
