import { db } from "@/db";
import { agentWorkItems } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

export async function getTopWorkItems(tenantId: string, limit = 10) {
  const priorityOrder = sql`CASE
    WHEN ${agentWorkItems.priority} = 'critical' THEN 0
    WHEN ${agentWorkItems.priority} = 'high' THEN 1
    WHEN ${agentWorkItems.priority} = 'medium' THEN 2
    WHEN ${agentWorkItems.priority} = 'low' THEN 3
    ELSE 4
  END`;

  return db
    .select()
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.tenantId, tenantId),
        eq(agentWorkItems.status, "active"),
      ),
    )
    .orderBy(priorityOrder, desc(agentWorkItems.updatedAt))
    .limit(limit);
}

export async function archiveWorkItem(
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(agentWorkItems)
    .set({
      status: "archived",
      archivedReason: reason,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentWorkItems.id, id));
}

export function serializeWorkQueue(
  items: Awaited<ReturnType<typeof getTopWorkItems>>,
): string {
  if (items.length === 0) return "";

  const lines = ["## Your Active Work Queue\n"];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const overdue =
      item.nextActionAt && item.nextActionAt.getTime() < Date.now()
        ? " (OVERDUE)"
        : "";
    const nextAction = item.nextAction
      ? `Next: ${item.nextActionDetail || item.nextAction}${overdue}`
      : "Monitoring";
    lines.push(
      `${i + 1}. **${item.entityLabel}** (${item.entityType}, ${item.strategy}) — ${nextAction}`,
    );
    lines.push(`   ${item.strategyReasoning}`);
  }
  return lines.join("\n");
}
