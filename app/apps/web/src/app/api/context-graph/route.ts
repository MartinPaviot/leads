import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contextGraphNodes, contextGraphEdges } from "@/db/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const includeInvalid = url.searchParams.get("includeInvalid") === "true";

  const nodeConditions = [eq(contextGraphNodes.tenantId, authCtx.tenantId)];
  if (entityType) nodeConditions.push(eq(contextGraphNodes.entityType, entityType));

  const nodes = await db.select().from(contextGraphNodes)
    .where(and(...nodeConditions))
    .orderBy(desc(contextGraphNodes.updatedAt))
    .limit(limit);

  const edgeConditions = [eq(contextGraphEdges.tenantId, authCtx.tenantId)];
  if (!includeInvalid) edgeConditions.push(isNull(contextGraphEdges.tInvalid));

  const edges = await db.select({
    id: contextGraphEdges.id,
    sourceNodeId: contextGraphEdges.sourceNodeId,
    targetNodeId: contextGraphEdges.targetNodeId,
    relationType: contextGraphEdges.relationType,
    fact: contextGraphEdges.fact,
    confidence: contextGraphEdges.confidence,
    tValid: contextGraphEdges.tValid,
    tInvalid: contextGraphEdges.tInvalid,
    sourceType: contextGraphEdges.sourceType,
  }).from(contextGraphEdges)
    .where(and(...edgeConditions))
    .limit(limit * 3);

  return Response.json({ nodes, edges });
}
