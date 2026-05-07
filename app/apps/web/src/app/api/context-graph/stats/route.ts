import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contextGraphNodes, contextGraphEdges } from "@/db/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [nodeCount] = await db.select({ count: sql<number>`count(*)` })
    .from(contextGraphNodes).where(eq(contextGraphNodes.tenantId, authCtx.tenantId));

  const [validEdgeCount] = await db.select({ count: sql<number>`count(*)` })
    .from(contextGraphEdges).where(and(
      eq(contextGraphEdges.tenantId, authCtx.tenantId),
      isNull(contextGraphEdges.tInvalid),
    ));

  const [invalidEdgeCount] = await db.select({ count: sql<number>`count(*)` })
    .from(contextGraphEdges).where(and(
      eq(contextGraphEdges.tenantId, authCtx.tenantId),
      sql`${contextGraphEdges.tInvalid} IS NOT NULL`,
    ));

  const [lastNode] = await db.select({ updatedAt: contextGraphNodes.updatedAt })
    .from(contextGraphNodes)
    .where(eq(contextGraphNodes.tenantId, authCtx.tenantId))
    .orderBy(desc(contextGraphNodes.updatedAt))
    .limit(1);

  // Entity type breakdown
  const typeBreakdown = await db.select({
    entityType: contextGraphNodes.entityType,
    count: sql<number>`count(*)`,
  }).from(contextGraphNodes)
    .where(eq(contextGraphNodes.tenantId, authCtx.tenantId))
    .groupBy(contextGraphNodes.entityType);

  return Response.json({
    nodes: nodeCount.count,
    validEdges: validEdgeCount.count,
    invalidEdges: invalidEdgeCount.count,
    lastUpdated: lastNode?.updatedAt,
    typeBreakdown: Object.fromEntries(typeBreakdown.map(t => [t.entityType, t.count])),
  });
}
