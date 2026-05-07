import { db } from "@/db";
import { contextGraphNodes, contextGraphEdges, users } from "@/db/schema";
import { eq, and, or, inArray, isNull } from "drizzle-orm";
import type { WarmPath } from "./types";

export async function findWarmPath(
  tenantId: string,
  targetContactId: string
): Promise<WarmPath | null> {
  // 1. Find team member nodes (the "me" nodes we start BFS from)
  const teamMembers = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.tenantId, tenantId));

  if (teamMembers.length === 0) return null;

  // Find graph nodes for team members
  const teamNodes = await db
    .select({ id: contextGraphNodes.id, entityId: contextGraphNodes.entityId, name: contextGraphNodes.name })
    .from(contextGraphNodes)
    .where(
      and(
        eq(contextGraphNodes.tenantId, tenantId),
        eq(contextGraphNodes.entityType, "person"),
        inArray(contextGraphNodes.entityId, teamMembers.map((m) => m.id))
      )
    );

  if (teamNodes.length === 0) return null;

  // Find target node
  const [targetNode] = await db
    .select({ id: contextGraphNodes.id, name: contextGraphNodes.name })
    .from(contextGraphNodes)
    .where(
      and(
        eq(contextGraphNodes.tenantId, tenantId),
        eq(contextGraphNodes.entityType, "person"),
        eq(contextGraphNodes.entityId, targetContactId)
      )
    )
    .limit(1);

  if (!targetNode) return null;

  const teamNodeIds = teamNodes.map((n) => n.id);

  // 2. BFS depth 1: direct edges from team to target
  const directEdges = await db
    .select()
    .from(contextGraphEdges)
    .where(
      and(
        eq(contextGraphEdges.tenantId, tenantId),
        or(
          and(inArray(contextGraphEdges.sourceNodeId, teamNodeIds), eq(contextGraphEdges.targetNodeId, targetNode.id)),
          and(eq(contextGraphEdges.sourceNodeId, targetNode.id), inArray(contextGraphEdges.targetNodeId, teamNodeIds))
        ),
        // Only active edges (not expired)
        or(isNull(contextGraphEdges.tInvalid), eq(contextGraphEdges.tInvalid, contextGraphEdges.tInvalid)) // simplified: just check existence
      )
    );

  if (directEdges.length > 0) {
    const edge = directEdges[0];
    const connectorNodeId = teamNodeIds.includes(edge.sourceNodeId) ? edge.sourceNodeId : edge.targetNodeId;
    const connectorNode = teamNodes.find((n) => n.id === connectorNodeId);

    return {
      distance: 1,
      connectorNodeId,
      connectorName: connectorNode?.name || "Team member",
      connectorEmail: null,
      lastActiveAt: edge.tCreated?.toISOString() || null,
      relationshipType: edge.relationType,
    };
  }

  // 3. BFS depth 2: team → intermediate → target
  // Find all nodes connected to team members
  const teamEdges = await db
    .select()
    .from(contextGraphEdges)
    .where(
      and(
        eq(contextGraphEdges.tenantId, tenantId),
        or(
          inArray(contextGraphEdges.sourceNodeId, teamNodeIds),
          inArray(contextGraphEdges.targetNodeId, teamNodeIds)
        )
      )
    );

  const intermediateNodeIds = new Set<string>();
  for (const edge of teamEdges) {
    if (!teamNodeIds.includes(edge.sourceNodeId)) intermediateNodeIds.add(edge.sourceNodeId);
    if (!teamNodeIds.includes(edge.targetNodeId)) intermediateNodeIds.add(edge.targetNodeId);
  }

  if (intermediateNodeIds.size === 0) return null;

  // Check if any intermediate connects to target
  const intermediateArray = Array.from(intermediateNodeIds);
  const intermediateToTarget = await db
    .select()
    .from(contextGraphEdges)
    .where(
      and(
        eq(contextGraphEdges.tenantId, tenantId),
        or(
          and(inArray(contextGraphEdges.sourceNodeId, intermediateArray), eq(contextGraphEdges.targetNodeId, targetNode.id)),
          and(eq(contextGraphEdges.sourceNodeId, targetNode.id), inArray(contextGraphEdges.targetNodeId, intermediateArray))
        )
      )
    )
    .limit(1);

  if (intermediateToTarget.length === 0) return null;

  const edge = intermediateToTarget[0];
  const intermediateId = edge.sourceNodeId === targetNode.id ? edge.targetNodeId : edge.sourceNodeId;

  // Get intermediate node info
  const [intermediateNode] = await db
    .select({ id: contextGraphNodes.id, name: contextGraphNodes.name })
    .from(contextGraphNodes)
    .where(eq(contextGraphNodes.id, intermediateId))
    .limit(1);

  return {
    distance: 2,
    connectorNodeId: intermediateId,
    connectorName: intermediateNode?.name || "Mutual connection",
    connectorEmail: null,
    lastActiveAt: edge.tCreated?.toISOString() || null,
    relationshipType: edge.relationType,
  };
}
