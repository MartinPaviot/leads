import { db } from "@/db";
import { contextGraphNodes, contextGraphEdges, tenants } from "@/db/schema";
import { eq, and, isNull, sql, lt } from "drizzle-orm";
import { verifyCronRequest } from "@/lib/auth/cron-auth";

/**
 * Graph self-correction cron:
 * 1. Dedup nodes that were created with slightly different names
 * 2. Invalidate low-confidence edges older than 30 days with no corroboration
 * 3. Merge orphan nodes (no edges) into their closest match
 *
 * Schedule: daily (via Vercel Cron or external scheduler)
 * Protected by CRON_SECRET header.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    // Get all tenants
    const allTenants = await db.select({ id: tenants.id }).from(tenants);

    let totalMerged = 0;
    let totalInvalidated = 0;
    let totalOrphansRemoved = 0;

    for (const tenant of allTenants) {
      const tenantId = tenant.id;

      // 1. Find and merge duplicate nodes (same name + type)
      const duplicates = await db.select({
        name: contextGraphNodes.name,
        entityType: contextGraphNodes.entityType,
        count: sql<number>`count(*)`,
      }).from(contextGraphNodes)
        .where(eq(contextGraphNodes.tenantId, tenantId))
        .groupBy(contextGraphNodes.name, contextGraphNodes.entityType)
        .having(sql`count(*) > 1`);

      for (const dup of duplicates) {
        const nodes = await db.select()
          .from(contextGraphNodes)
          .where(and(
            eq(contextGraphNodes.tenantId, tenantId),
            eq(contextGraphNodes.name, dup.name),
            eq(contextGraphNodes.entityType, dup.entityType),
          ))
          .orderBy(contextGraphNodes.createdAt);

        if (nodes.length < 2) continue;

        // Keep the oldest node, merge edges from newer ones
        const keepNode = nodes[0];
        for (let i = 1; i < nodes.length; i++) {
          const mergeNode = nodes[i];

          // Re-point source edges
          await db.update(contextGraphEdges)
            .set({ sourceNodeId: keepNode.id })
            .where(and(
              eq(contextGraphEdges.tenantId, tenantId),
              eq(contextGraphEdges.sourceNodeId, mergeNode.id),
            ));

          // Re-point target edges
          await db.update(contextGraphEdges)
            .set({ targetNodeId: keepNode.id })
            .where(and(
              eq(contextGraphEdges.tenantId, tenantId),
              eq(contextGraphEdges.targetNodeId, mergeNode.id),
            ));

          // Delete the duplicate node
          await db.delete(contextGraphNodes)
            .where(eq(contextGraphNodes.id, mergeNode.id));

          totalMerged++;
        }

        // Update kept node summary if any merged node had a better one
        const bestSummary = nodes.find(n => n.summary && n.summary.length > (keepNode.summary?.length || 0))?.summary;
        if (bestSummary) {
          await db.update(contextGraphNodes)
            .set({ summary: bestSummary, updatedAt: new Date() })
            .where(eq(contextGraphNodes.id, keepNode.id));
        }
      }

      // 2. Invalidate low-confidence edges older than 30 days with no corroboration
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const weakEdges = await db.select({ id: contextGraphEdges.id })
        .from(contextGraphEdges)
        .where(and(
          eq(contextGraphEdges.tenantId, tenantId),
          isNull(contextGraphEdges.tInvalid),
          lt(contextGraphEdges.confidence, 0.5),
          lt(contextGraphEdges.createdAt, thirtyDaysAgo),
        ));

      for (const edge of weakEdges) {
        await db.update(contextGraphEdges)
          .set({
            tInvalid: new Date(),
            tExpired: new Date(),
            metadata: {
              invalidatedBy: "graph-maintenance-cron",
              reason: "Low confidence edge older than 30 days",
              invalidatedAt: new Date().toISOString(),
            },
          })
          .where(eq(contextGraphEdges.id, edge.id));
        totalInvalidated++;
      }

      // 3. Remove orphan nodes with no edges (older than 7 days to avoid removing just-created ones).
      // Bound via SQL interval, not a JS Date param: a bare `${dateObj}` in a sql``
      // template throws `ERR_INVALID_ARG_TYPE` at postgres-js Bind time.
      const orphanNodes: Array<{ id: string }> = await db.execute(sql`
        SELECT n.id FROM context_graph_nodes n
        LEFT JOIN context_graph_edges e1 ON n.id = e1.source_node_id
        LEFT JOIN context_graph_edges e2 ON n.id = e2.target_node_id
        WHERE n.tenant_id = ${tenantId}
          AND e1.id IS NULL
          AND e2.id IS NULL
          AND n.created_at < now() - interval '7 days'
      `);

      for (const orphan of orphanNodes) {
        await db.delete(contextGraphNodes)
          .where(eq(contextGraphNodes.id, orphan.id));
        totalOrphansRemoved++;
      }
    }

    return Response.json({
      success: true,
      tenantsProcessed: allTenants.length,
      nodesMerged: totalMerged,
      edgesInvalidated: totalInvalidated,
      orphansRemoved: totalOrphansRemoved,
    });
  } catch (error) {
    console.error("Graph maintenance failed:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
