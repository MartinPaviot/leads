/**
 * Knowledge Graph Multi-Hop Reasoning
 *
 * Answers relationship questions by traversing the contextGraphNodes
 * and contextGraphEdges tables. Supports queries like:
 * - "Who can introduce me to the CTO of Acme?" (find shared connections)
 * - "What companies have we talked to in the same industry as Acme?"
 * - "Which deals involve people who attended the same meeting?"
 *
 * Algorithm:
 * 1. Parse the query to identify source and target entities
 * 2. BFS/DFS traversal of the graph with max depth 3
 * 3. Score paths by edge confidence and recency
 * 4. Return top paths with natural language explanation
 *
 * Uses SQL recursive CTEs (WITH RECURSIVE) for efficient multi-hop
 * traversal directly in the database, avoiding N+1 queries.
 */

import { db } from "@/db";
import { contextGraphNodes, contextGraphEdges } from "@/db/schema";
import { eq, and, or, isNull, ilike, desc, sql } from "drizzle-orm";
import postgres from "postgres";

const rawSql = postgres(process.env.DATABASE_URL!);

// ── Types ────────────────────────────────────────────────────

export interface GraphPath {
  /** Ordered nodes along the path (source → ... → target). */
  nodes: Array<{ id: string; name: string; type: string }>;
  /** Edges connecting consecutive nodes in the path. */
  edges: Array<{ relation: string; confidence: number; fact: string }>;
  /** Composite score: product of edge confidences, weighted by recency. */
  score: number;
  /** Human-readable explanation of the path. */
  explanation: string;
}

interface RawPathRow {
  path_node_ids: string[];
  path_node_names: string[];
  path_node_types: string[];
  path_edge_relations: string[];
  path_edge_confidences: number[];
  path_edge_facts: string[];
  path_edge_valid_dates: (Date | null)[];
  depth: number;
}

// ── Core: Find Paths Between Entities ────────────────────────

/**
 * Find all paths between a source entity and an optional target entity
 * (or target type) up to maxDepth hops. Uses a recursive CTE for
 * efficient in-database traversal.
 *
 * @param tenantId - Tenant isolation
 * @param sourceEntityId - Starting node ID
 * @param targetEntityId - Optional: specific target node ID
 * @param targetType - Optional: target entity type (e.g. "company", "person")
 * @param maxDepth - Max hops (default 3, capped at 4 for safety)
 * @returns Scored and sorted paths
 */
export async function findPaths(
  tenantId: string,
  sourceEntityId: string,
  targetEntityId?: string,
  targetType?: string,
  maxDepth: number = 3,
): Promise<GraphPath[]> {
  const depth = Math.min(maxDepth, 4);

  // Verify source exists
  const [sourceNode] = await db
    .select({ id: contextGraphNodes.id, name: contextGraphNodes.name, entityType: contextGraphNodes.entityType })
    .from(contextGraphNodes)
    .where(and(eq(contextGraphNodes.id, sourceEntityId), eq(contextGraphNodes.tenantId, tenantId)))
    .limit(1);

  if (!sourceNode) return [];

  // Use recursive CTE for multi-hop traversal
  // The CTE tracks: current node, visited path (as arrays), depth
  const rows = await rawSql<RawPathRow[]>`
    WITH RECURSIVE graph_traverse AS (
      -- Base case: start from the source node
      SELECT
        n.id AS current_id,
        ARRAY[n.id] AS path_node_ids,
        ARRAY[n.name] AS path_node_names,
        ARRAY[n.entity_type] AS path_node_types,
        ARRAY[]::text[] AS path_edge_relations,
        ARRAY[]::real[] AS path_edge_confidences,
        ARRAY[]::text[] AS path_edge_facts,
        ARRAY[]::timestamptz[] AS path_edge_valid_dates,
        0 AS depth
      FROM context_graph_nodes n
      WHERE n.id = ${sourceEntityId}
        AND n.tenant_id = ${tenantId}

      UNION ALL

      -- Recursive case: traverse edges (both directions)
      SELECT
        next_node.id AS current_id,
        gt.path_node_ids || next_node.id,
        gt.path_node_names || next_node.name,
        gt.path_node_types || next_node.entity_type,
        gt.path_edge_relations || e.relation_type,
        gt.path_edge_confidences || COALESCE(e.confidence, 1.0),
        gt.path_edge_facts || e.fact,
        gt.path_edge_valid_dates || e.t_valid,
        gt.depth + 1
      FROM graph_traverse gt
      JOIN context_graph_edges e ON (
        (e.source_node_id = gt.current_id OR e.target_node_id = gt.current_id)
        AND e.tenant_id = ${tenantId}
        AND e.t_invalid IS NULL
      )
      JOIN context_graph_nodes next_node ON (
        next_node.id = CASE
          WHEN e.source_node_id = gt.current_id THEN e.target_node_id
          ELSE e.source_node_id
        END
        AND next_node.tenant_id = ${tenantId}
      )
      WHERE gt.depth < ${depth}
        AND NOT (next_node.id = ANY(gt.path_node_ids))  -- prevent cycles
    )
    SELECT
      path_node_ids,
      path_node_names,
      path_node_types,
      path_edge_relations,
      path_edge_confidences,
      path_edge_facts,
      path_edge_valid_dates,
      depth
    FROM graph_traverse
    WHERE depth > 0
      ${targetEntityId ? rawSql`AND current_id = ${targetEntityId}` : rawSql``}
      ${targetType ? rawSql`AND path_node_types[array_length(path_node_types, 1)] = ${targetType}` : rawSql``}
    ORDER BY depth ASC
    LIMIT 50
  `;

  // Convert raw rows to GraphPath objects with scoring
  const paths: GraphPath[] = rows.map((row) => {
    const nodes = row.path_node_ids.map((id: string, i: number) => ({
      id,
      name: row.path_node_names[i],
      type: row.path_node_types[i],
    }));

    const edges = row.path_edge_relations.map((relation: string, i: number) => ({
      relation,
      confidence: row.path_edge_confidences[i] ?? 1.0,
      fact: row.path_edge_facts[i] ?? "",
    }));

    // Score: product of confidences, penalized by depth
    const confidenceProduct = edges.reduce(
      (acc: number, e: { confidence: number }) => acc * e.confidence,
      1.0,
    );
    // Recency bonus: newer edges get a small boost
    const recencyBonus = row.path_edge_valid_dates.reduce(
      (acc: number, d: Date | null) => {
        if (!d) return acc;
        const daysSince = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
        // Decay: 1.0 for today, 0.5 for 90 days ago
        return acc + Math.max(0, 1.0 - daysSince / 180);
      },
      0,
    );
    const avgRecency = edges.length > 0 ? recencyBonus / edges.length : 0.5;

    // Depth penalty: shorter paths are preferred
    const depthPenalty = 1.0 / (1.0 + (row.depth - 1) * 0.3);

    const score = confidenceProduct * depthPenalty * (0.7 + 0.3 * avgRecency);

    // Build explanation
    const explanation = buildPathExplanation(nodes, edges);

    return { nodes, edges, score, explanation };
  });

  // Sort by score descending, return top 10
  paths.sort((a, b) => b.score - a.score);
  return paths.slice(0, 10);
}

// ── Shared Connections ──────────────────────────────────────

/**
 * Find entities that connect two given entities (shared connections).
 * e.g., "Who can introduce me to the CTO of Acme?" finds people
 * connected to both you and the CTO.
 *
 * Algorithm: find all paths of length 2 between A and B,
 * then extract the middle nodes as shared connections.
 */
export async function findSharedConnections(
  tenantId: string,
  entityIdA: string,
  entityIdB: string,
): Promise<GraphPath[]> {
  // Verify both entities exist
  const [nodeA, nodeB] = await Promise.all([
    db.select({ id: contextGraphNodes.id, name: contextGraphNodes.name, entityType: contextGraphNodes.entityType })
      .from(contextGraphNodes)
      .where(and(eq(contextGraphNodes.id, entityIdA), eq(contextGraphNodes.tenantId, tenantId)))
      .limit(1)
      .then((r) => r[0]),
    db.select({ id: contextGraphNodes.id, name: contextGraphNodes.name, entityType: contextGraphNodes.entityType })
      .from(contextGraphNodes)
      .where(and(eq(contextGraphNodes.id, entityIdB), eq(contextGraphNodes.tenantId, tenantId)))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!nodeA || !nodeB) return [];

  // Find 2-hop paths: A → middle → B
  const rows = await rawSql`
    SELECT
      mid.id AS middle_id,
      mid.name AS middle_name,
      mid.entity_type AS middle_type,
      e1.relation_type AS rel_a_mid,
      e1.confidence AS conf_a_mid,
      e1.fact AS fact_a_mid,
      e1.t_valid AS valid_a_mid,
      e2.relation_type AS rel_mid_b,
      e2.confidence AS conf_mid_b,
      e2.fact AS fact_mid_b,
      e2.t_valid AS valid_mid_b
    FROM context_graph_edges e1
    JOIN context_graph_edges e2 ON (
      -- e1 connects A to middle, e2 connects middle to B
      (CASE WHEN e1.source_node_id = ${entityIdA} THEN e1.target_node_id ELSE e1.source_node_id END)
      =
      (CASE WHEN e2.source_node_id = ${entityIdB} THEN e2.target_node_id ELSE e2.source_node_id END)
    )
    JOIN context_graph_nodes mid ON (
      mid.id = (CASE WHEN e1.source_node_id = ${entityIdA} THEN e1.target_node_id ELSE e1.source_node_id END)
      AND mid.tenant_id = ${tenantId}
    )
    WHERE e1.tenant_id = ${tenantId}
      AND e2.tenant_id = ${tenantId}
      AND e1.t_invalid IS NULL
      AND e2.t_invalid IS NULL
      AND (e1.source_node_id = ${entityIdA} OR e1.target_node_id = ${entityIdA})
      AND (e2.source_node_id = ${entityIdB} OR e2.target_node_id = ${entityIdB})
      AND mid.id != ${entityIdA}
      AND mid.id != ${entityIdB}
    LIMIT 20
  `;

  // Convert to GraphPath
  const paths: GraphPath[] = rows.map((row: Record<string, unknown>) => {
    const nodes = [
      { id: nodeA.id, name: nodeA.name, type: nodeA.entityType },
      { id: row.middle_id as string, name: row.middle_name as string, type: row.middle_type as string },
      { id: nodeB.id, name: nodeB.name, type: nodeB.entityType },
    ];

    const edges = [
      {
        relation: row.rel_a_mid as string,
        confidence: (row.conf_a_mid as number) ?? 1.0,
        fact: row.fact_a_mid as string,
      },
      {
        relation: row.rel_mid_b as string,
        confidence: (row.conf_mid_b as number) ?? 1.0,
        fact: row.fact_mid_b as string,
      },
    ];

    const score = edges[0].confidence * edges[1].confidence;

    const explanation =
      `${nodeA.name} is connected to ${row.middle_name as string} ` +
      `(${row.rel_a_mid as string}: "${row.fact_a_mid as string}"), ` +
      `and ${row.middle_name as string} is connected to ${nodeB.name} ` +
      `(${row.rel_mid_b as string}: "${row.fact_mid_b as string}")`;

    return { nodes, edges, score, explanation };
  });

  paths.sort((a, b) => b.score - a.score);
  return paths.slice(0, 10);
}

// ── Related Entities by Relation Type ───────────────────────

/**
 * Find entities related to a source entity by a specific relation type,
 * traversing up to maxHops.
 *
 * e.g., "Find all companies where people from Acme work"
 *   → source=Acme, relationType=WORKS_AT, maxHops=2
 */
export async function findRelatedEntities(
  tenantId: string,
  entityId: string,
  relationType: string,
  maxHops: number = 2,
): Promise<Array<{ entity: { id: string; name: string; type: string }; path: GraphPath }>> {
  const depth = Math.min(maxHops, 3);

  // Use recursive CTE filtering by relation type at each hop
  const rows = await rawSql<RawPathRow[]>`
    WITH RECURSIVE related_traverse AS (
      SELECT
        n.id AS current_id,
        ARRAY[n.id] AS path_node_ids,
        ARRAY[n.name] AS path_node_names,
        ARRAY[n.entity_type] AS path_node_types,
        ARRAY[]::text[] AS path_edge_relations,
        ARRAY[]::real[] AS path_edge_confidences,
        ARRAY[]::text[] AS path_edge_facts,
        ARRAY[]::timestamptz[] AS path_edge_valid_dates,
        0 AS depth
      FROM context_graph_nodes n
      WHERE n.id = ${entityId}
        AND n.tenant_id = ${tenantId}

      UNION ALL

      SELECT
        next_node.id,
        rt.path_node_ids || next_node.id,
        rt.path_node_names || next_node.name,
        rt.path_node_types || next_node.entity_type,
        rt.path_edge_relations || e.relation_type,
        rt.path_edge_confidences || COALESCE(e.confidence, 1.0),
        rt.path_edge_facts || e.fact,
        rt.path_edge_valid_dates || e.t_valid,
        rt.depth + 1
      FROM related_traverse rt
      JOIN context_graph_edges e ON (
        (e.source_node_id = rt.current_id OR e.target_node_id = rt.current_id)
        AND e.tenant_id = ${tenantId}
        AND e.t_invalid IS NULL
        AND e.relation_type = ${relationType}
      )
      JOIN context_graph_nodes next_node ON (
        next_node.id = CASE
          WHEN e.source_node_id = rt.current_id THEN e.target_node_id
          ELSE e.source_node_id
        END
        AND next_node.tenant_id = ${tenantId}
      )
      WHERE rt.depth < ${depth}
        AND NOT (next_node.id = ANY(rt.path_node_ids))
    )
    SELECT
      path_node_ids,
      path_node_names,
      path_node_types,
      path_edge_relations,
      path_edge_confidences,
      path_edge_facts,
      path_edge_valid_dates,
      depth
    FROM related_traverse
    WHERE depth > 0
    ORDER BY depth ASC
    LIMIT 30
  `;

  // Deduplicate by terminal node ID
  const seen = new Set<string>();
  const results: Array<{ entity: { id: string; name: string; type: string }; path: GraphPath }> = [];

  for (const row of rows) {
    const terminalId = row.path_node_ids[row.path_node_ids.length - 1];
    if (seen.has(terminalId) || terminalId === entityId) continue;
    seen.add(terminalId);

    const nodes = row.path_node_ids.map((id: string, i: number) => ({
      id,
      name: row.path_node_names[i],
      type: row.path_node_types[i],
    }));

    const edges = row.path_edge_relations.map((relation: string, i: number) => ({
      relation,
      confidence: row.path_edge_confidences[i] ?? 1.0,
      fact: row.path_edge_facts[i] ?? "",
    }));

    const confidenceProduct = edges.reduce(
      (acc: number, e: { confidence: number }) => acc * e.confidence,
      1.0,
    );
    const depthPenalty = 1.0 / (1.0 + (row.depth - 1) * 0.3);
    const score = confidenceProduct * depthPenalty;

    const explanation = buildPathExplanation(nodes, edges);

    const terminal = nodes[nodes.length - 1];
    results.push({
      entity: { id: terminal.id, name: terminal.name, type: terminal.type },
      path: { nodes, edges, score, explanation },
    });
  }

  results.sort((a, b) => b.path.score - a.path.score);
  return results.slice(0, 15);
}

// ── Entity Lookup Helpers ───────────────────────────────────

/**
 * Find a graph node by name (fuzzy). Used by the chat tool to resolve
 * entity names from the user's query to node IDs.
 */
export async function findNodeByName(
  tenantId: string,
  name: string,
  entityType?: string,
): Promise<{ id: string; name: string; type: string } | null> {
  const conditions = [
    eq(contextGraphNodes.tenantId, tenantId),
    ilike(contextGraphNodes.name, `%${name}%`),
  ];
  if (entityType) {
    conditions.push(eq(contextGraphNodes.entityType, entityType));
  }

  const [node] = await db
    .select({
      id: contextGraphNodes.id,
      name: contextGraphNodes.name,
      entityType: contextGraphNodes.entityType,
    })
    .from(contextGraphNodes)
    .where(and(...conditions))
    .orderBy(
      // Prefer exact matches over partial
      sql`CASE WHEN LOWER(name) = LOWER(${name}) THEN 0 ELSE 1 END`,
      desc(contextGraphNodes.updatedAt),
    )
    .limit(1);

  if (!node) return null;
  return { id: node.id, name: node.name, type: node.entityType };
}

/**
 * List all distinct relation types in the tenant's graph.
 * Useful for the chat tool to show available relation types.
 */
export async function listRelationTypes(tenantId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ relationType: contextGraphEdges.relationType })
    .from(contextGraphEdges)
    .where(and(
      eq(contextGraphEdges.tenantId, tenantId),
      isNull(contextGraphEdges.tInvalid),
    ));

  return rows.map((r) => r.relationType);
}

// ── Explanation Builder ─────────────────────────────────────

function buildPathExplanation(
  nodes: Array<{ id: string; name: string; type: string }>,
  edges: Array<{ relation: string; confidence: number; fact: string }>,
): string {
  if (nodes.length < 2 || edges.length === 0) {
    return `Found ${nodes[0]?.name || "unknown entity"}`;
  }

  // Build a chain: "A --[RELATION]--> B --[RELATION]--> C"
  const parts: string[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (i === 0) {
      parts.push(nodes[i].name);
    }
    const arrow = `--[${edges[i].relation}]-->`;
    parts.push(arrow);
    parts.push(nodes[i + 1].name);
  }

  const chain = parts.join(" ");
  const facts = edges.map((e) => e.fact).filter(Boolean);

  if (facts.length > 0) {
    return `${chain}. Evidence: ${facts.join("; ")}`;
  }

  return chain;
}
