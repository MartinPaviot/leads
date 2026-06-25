/**
 * Context Graph — Bi-temporal knowledge graph for agent memory.
 *
 * Inspired by Graphiti/Zep architecture:
 * - Entity extraction from unstructured text (emails, meetings, notes)
 * - Entity resolution (dedup via embedding similarity + name matching)
 * - Edge resolution with temporal invalidation (self-correction)
 * - Hybrid retrieval: vector similarity + graph traversal + RRF
 *
 * Key principle: new information invalidates old edges, never deletes them.
 * This preserves full history for "what did we know when?" queries.
 */

import { db } from "@/db";
import { contextGraphNodes, contextGraphEdges } from "@/db/schema";
import { eq, and, desc, sql, isNull, or, ilike } from "drizzle-orm";
import { embedText } from "./embeddings";
import postgres from "postgres";

const rawSql = postgres(process.env.DATABASE_URL!);

// ─── Types ────────────────────────────────────────────────────

interface ExtractedEntity {
  name: string;
  entityType: "person" | "company" | "deal" | "topic" | "event";
  summary?: string;
}

interface ExtractedFact {
  sourceEntity: string; // name
  targetEntity: string; // name
  relationType: string; // WORKS_AT, DISCUSSED, ATTENDED, etc.
  fact: string; // human-readable description
  confidence: number;
  temporalInfo?: { validFrom?: string; validTo?: string };
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
}

// ─── 1. Entity & Fact Extraction ──────────────────────────────

export async function extractEntitiesAndFacts(
  text: string,
  sourceType: string,
): Promise<ExtractionResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) return { entities: [], facts: [] };

  const prompt = `Extract entities and relationships from this ${sourceType} content. Return valid JSON only.

<content>
${text.slice(0, 4000)}
</content>

<output_schema>
{
  "entities": [
    { "name": "Full Name or Title", "entityType": "person|company|deal|topic|event", "summary": "one-line description" }
  ],
  "facts": [
    {
      "sourceEntity": "Entity A name (must match an entity above)",
      "targetEntity": "Entity B name (must match an entity above)",
      "relationType": "WORKS_AT|INVOLVED_IN|DISCUSSED|ATTENDED|SENT_EMAIL|MENTIONED|MANAGES|INTERESTED_IN|COMPETES_WITH|PARTNERED_WITH|REQUESTED|OBJECTED_TO",
      "fact": "Human-readable fact sentence",
      "confidence": 0.0-1.0,
      "temporalInfo": { "validFrom": "ISO date or null", "validTo": "ISO date or null" }
    }
  ]
}
</output_schema>

<examples>
<example>
INPUT (email): "Hi Sarah, following up on our call yesterday. I spoke with Marc about the Meridian Labs deal — he's concerned about the $50K budget. Let's reconnect Thursday to discuss the revised proposal. Best, Thomas"
OUTPUT:
{
  "entities": [
    { "name": "Sarah", "entityType": "person", "summary": "Email recipient, involved in deal discussion" },
    { "name": "Thomas", "entityType": "person", "summary": "Email sender" },
    { "name": "Marc", "entityType": "person", "summary": "Stakeholder with budget concerns" },
    { "name": "Meridian Labs", "entityType": "company", "summary": "Company with active deal" },
    { "name": "Meridian Labs deal", "entityType": "deal", "summary": "Deal with $50K budget under discussion" }
  ],
  "facts": [
    { "sourceEntity": "Thomas", "targetEntity": "Sarah", "relationType": "SENT_EMAIL", "fact": "Thomas sent follow-up email to Sarah about the Meridian Labs deal", "confidence": 1.0, "temporalInfo": { "validFrom": null, "validTo": null } },
    { "sourceEntity": "Marc", "targetEntity": "Meridian Labs deal", "relationType": "OBJECTED_TO", "fact": "Marc is concerned about the $50K budget for the Meridian Labs deal", "confidence": 0.9, "temporalInfo": { "validFrom": null, "validTo": null } },
    { "sourceEntity": "Meridian Labs deal", "targetEntity": "Meridian Labs", "relationType": "INVOLVED_IN", "fact": "Active deal with Meridian Labs valued at $50K", "confidence": 1.0, "temporalInfo": { "validFrom": null, "validTo": null } }
  ]
}
</example>
<example>
INPUT (meeting): "Meeting with DataSync CEO Marc Dupont and VP Eng Lisa Park. Discussed API integration project. They use Jira and Linear. Budget: $30K. Timeline: Q3. Competitor mentioned: Monday.com."
OUTPUT:
{
  "entities": [
    { "name": "Marc Dupont", "entityType": "person", "summary": "CEO of DataSync" },
    { "name": "Lisa Park", "entityType": "person", "summary": "VP Engineering at DataSync" },
    { "name": "DataSync", "entityType": "company", "summary": "Prospect company evaluating API integration" },
    { "name": "API Integration", "entityType": "deal", "summary": "Integration project, $30K budget, Q3 timeline" },
    { "name": "Monday.com", "entityType": "company", "summary": "Competitor being evaluated" }
  ],
  "facts": [
    { "sourceEntity": "Marc Dupont", "targetEntity": "DataSync", "relationType": "WORKS_AT", "fact": "Marc Dupont is CEO of DataSync", "confidence": 1.0, "temporalInfo": { "validFrom": null, "validTo": null } },
    { "sourceEntity": "Lisa Park", "targetEntity": "DataSync", "relationType": "WORKS_AT", "fact": "Lisa Park is VP Engineering at DataSync", "confidence": 1.0, "temporalInfo": { "validFrom": null, "validTo": null } },
    { "sourceEntity": "DataSync", "targetEntity": "Monday.com", "relationType": "COMPETES_WITH", "fact": "DataSync is also evaluating Monday.com for the API integration project", "confidence": 0.8, "temporalInfo": { "validFrom": null, "validTo": null } },
    { "sourceEntity": "Marc Dupont", "targetEntity": "API Integration", "relationType": "INVOLVED_IN", "fact": "Marc attended the meeting to discuss the API integration project", "confidence": 1.0, "temporalInfo": { "validFrom": null, "validTo": null } }
  ]
}
</example>
</examples>

<rules>
- Extract ALL people, companies, products, topics, and events mentioned
- Every entity in a fact must appear in the entities array
- Use the most specific relation type available
- Confidence: 1.0 for explicit statements, 0.7-0.9 for strong inferences, 0.5 for weak guesses
- Include temporal info when dates or timeframes are mentioned
- Use full names with proper capitalization — never abbreviate
- If the same person is mentioned by first name only, still extract them
- Return valid JSON only — no markdown fencing, no commentary
</rules>`;

  try {
    let resultText: string;
    if (anthropicKey) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const { generateText } = await import("ai");
      const result = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        prompt,
      });
      resultText = result.text;
    } else {
      const { openai } = await import("@ai-sdk/openai");
      const { generateText } = await import("ai");
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
      });
      resultText = result.text;
    }

    const parsed = JSON.parse(resultText.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    return {
      entities: parsed.entities || [],
      facts: parsed.facts || [],
    };
  } catch (err) {
    console.error("Entity extraction failed:", err);
    return { entities: [], facts: [] };
  }
}

// ─── 2. Entity Resolution ─────────────────────────────────────

export async function resolveEntity(
  candidate: ExtractedEntity,
  tenantId: string,
): Promise<string> {
  // Check for exact name match first (fast path)
  const [exactMatch] = await db.select({ id: contextGraphNodes.id })
    .from(contextGraphNodes)
    .where(and(
      eq(contextGraphNodes.tenantId, tenantId),
      eq(contextGraphNodes.name, candidate.name),
      eq(contextGraphNodes.entityType, candidate.entityType),
    ))
    .limit(1);

  if (exactMatch) return exactMatch.id;

  // Check for fuzzy name match
  const fuzzyMatches = await db.select({ id: contextGraphNodes.id, name: contextGraphNodes.name })
    .from(contextGraphNodes)
    .where(and(
      eq(contextGraphNodes.tenantId, tenantId),
      eq(contextGraphNodes.entityType, candidate.entityType),
      ilike(contextGraphNodes.name, `%${candidate.name.split(" ")[0]}%`),
    ))
    .limit(5);

  // If fuzzy matches found, check embedding similarity
  if (fuzzyMatches.length > 0 && process.env.OPENAI_API_KEY) {
    try {
      const candidateEmbedding = await embedText(candidate.name + " " + (candidate.summary || ""));
      const vectorStr = `[${candidateEmbedding.join(",")}]`;

      // Check similarity against candidates using raw SQL (pgvector)
      const results = await rawSql`
        SELECT id, name, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM context_graph_nodes
        WHERE tenant_id = ${tenantId}
          AND entity_type = ${candidate.entityType}
          AND id = ANY(${fuzzyMatches.map(m => m.id)})
        ORDER BY similarity DESC
        LIMIT 1
      `;

      if (results.length > 0 && (results[0].similarity as number) > 0.85) {
        // High similarity — merge: update summary if new one is better
        if (candidate.summary) {
          await db.update(contextGraphNodes).set({
            summary: candidate.summary,
            updatedAt: new Date(),
          }).where(eq(contextGraphNodes.id, results[0].id as string));
        }
        return results[0].id as string;
      }
    } catch {
      // Embedding comparison failed — fall through to create new
    }
  }

  // No match — create new node
  const embedding = process.env.OPENAI_API_KEY
    ? await embedText(candidate.name + " " + (candidate.summary || "")).catch(() => null)
    : null;

  const [newNode] = await db.insert(contextGraphNodes).values({
    tenantId,
    entityType: candidate.entityType,
    name: candidate.name,
    summary: candidate.summary,
  }).returning();

  // Store embedding via raw SQL if available
  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;
    await rawSql`
      UPDATE context_graph_nodes SET embedding = ${vectorStr}::vector
      WHERE id = ${newNode.id}
    `.catch((e) => console.warn("context-graph: embedding update failed (non-blocking)", e));
  }

  return newNode.id;
}

// ─── 3. Edge Resolution (Self-Correction) ─────────────────────

export async function resolveEdge(
  sourceNodeId: string,
  targetNodeId: string,
  relationType: string,
  fact: string,
  confidence: number,
  tenantId: string,
  temporalInfo?: { validFrom?: string; validTo?: string },
  sourceType?: string,
  sourceId?: string,
): Promise<string> {
  // Find existing edges between the same pair with the same relation type
  const existingEdges = await db.select()
    .from(contextGraphEdges)
    .where(and(
      eq(contextGraphEdges.tenantId, tenantId),
      eq(contextGraphEdges.sourceNodeId, sourceNodeId),
      eq(contextGraphEdges.targetNodeId, targetNodeId),
      eq(contextGraphEdges.relationType, relationType),
      isNull(contextGraphEdges.tInvalid), // Only consider still-valid edges
    ));

  // Check for contradictions with existing edges
  if (existingEdges.length > 0) {
    const isContradiction = await detectContradiction(
      existingEdges.map(e => e.fact),
      fact,
    );

    if (isContradiction) {
      // Temporal invalidation: mark old edges as invalid (never delete)
      const now = new Date();
      for (const oldEdge of existingEdges) {
        await db.update(contextGraphEdges).set({
          tInvalid: temporalInfo?.validFrom ? new Date(temporalInfo.validFrom) : now,
          tExpired: now,
          metadata: {
            ...(oldEdge.metadata as Record<string, unknown> || {}),
            invalidatedBy: fact,
            invalidatedAt: now.toISOString(),
          },
        }).where(eq(contextGraphEdges.id, oldEdge.id));
      }
    } else {
      // Not a contradiction — check if it's a duplicate
      const isDuplicate = existingEdges.some(e =>
        e.fact.toLowerCase().trim() === fact.toLowerCase().trim()
      );
      if (isDuplicate) return existingEdges[0].id;
    }
  }

  // Insert new edge
  const [newEdge] = await db.insert(contextGraphEdges).values({
    tenantId,
    sourceNodeId,
    targetNodeId,
    relationType,
    fact,
    confidence,
    tValid: temporalInfo?.validFrom ? new Date(temporalInfo.validFrom) : new Date(),
    tInvalid: temporalInfo?.validTo ? new Date(temporalInfo.validTo) : undefined,
    sourceType,
    sourceId,
  }).returning();

  // Embed the fact for retrieval
  if (process.env.OPENAI_API_KEY) {
    try {
      const embedding = await embedText(fact);
      const vectorStr = `[${embedding.join(",")}]`;
      await rawSql`
        UPDATE context_graph_edges SET embedding = ${vectorStr}::vector
        WHERE id = ${newEdge.id}
      `;
    } catch {
      // Non-critical
    }
  }

  return newEdge.id;
}

async function detectContradiction(existingFacts: string[], newFact: string): Promise<boolean> {
  // Quick heuristic: if facts are very similar, not a contradiction (just an update)
  for (const existing of existingFacts) {
    const similarity = jaccardSimilarity(existing.toLowerCase(), newFact.toLowerCase());
    if (similarity > 0.8) return false; // Too similar to be a contradiction
  }

  // Use LLM for nuanced contradiction detection
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) return false;

  try {
    const prompt = `Do these facts contradict each other? Answer only "yes" or "no".

Existing facts:
${existingFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

New fact:
${newFact}

A contradiction means the new fact makes an existing fact no longer true.
Example contradiction: "Sarah works at Acme" vs "Sarah left Acme and joined Beta Corp"
NOT a contradiction: "Sarah works at Acme" vs "Sarah is VP Sales at Acme" (refinement)`;

    let answer: string;
    if (anthropicKey) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const { generateText } = await import("ai");
      const result = await generateText({ model: anthropic("claude-haiku-4-5-20251001"), prompt });
      answer = result.text.trim().toLowerCase();
    } else {
      const { openai } = await import("@ai-sdk/openai");
      const { generateText } = await import("ai");
      const result = await generateText({ model: openai("gpt-4o-mini"), prompt });
      answer = result.text.trim().toLowerCase();
    }

    return answer.startsWith("yes");
  } catch {
    return false;
  }
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ─── 4. Ingest Episode (Orchestrator) ─────────────────────────

export async function ingestEpisode(
  tenantId: string,
  content: string,
  sourceType: string,
  sourceId?: string,
): Promise<{ nodesCreated: number; edgesCreated: number }> {
  if (!content || content.trim().length < 20) {
    return { nodesCreated: 0, edgesCreated: 0 };
  }

  // Step 1: Extract entities and facts
  const extraction = await extractEntitiesAndFacts(content, sourceType);
  if (extraction.entities.length === 0) return { nodesCreated: 0, edgesCreated: 0 };

  // Step 2: Resolve entities (dedup)
  const nodeIdByName = new Map<string, string>();
  let nodesCreated = 0;

  for (const entity of extraction.entities) {
    const existingCount = await db.select({ count: sql<number>`count(*)` })
      .from(contextGraphNodes)
      .where(and(
        eq(contextGraphNodes.tenantId, tenantId),
        eq(contextGraphNodes.name, entity.name),
      ));
    const wasNew = (existingCount[0]?.count || 0) === 0;

    const nodeId = await resolveEntity(entity, tenantId);
    nodeIdByName.set(entity.name, nodeId);

    if (wasNew) nodesCreated++;
  }

  // Step 3: Resolve edges (with temporal invalidation)
  let edgesCreated = 0;
  for (const fact of extraction.facts) {
    const sourceId2 = nodeIdByName.get(fact.sourceEntity);
    const targetId = nodeIdByName.get(fact.targetEntity);
    if (!sourceId2 || !targetId) continue;

    await resolveEdge(
      sourceId2,
      targetId,
      fact.relationType,
      fact.fact,
      fact.confidence,
      tenantId,
      fact.temporalInfo,
      sourceType,
      sourceId,
    );
    edgesCreated++;
  }

  return { nodesCreated, edgesCreated };
}

// ─── 5. Hybrid Retrieval ──────────────────────────────────────

export interface GraphSearchResult {
  facts: Array<{
    fact: string;
    relationType: string;
    sourceName: string;
    targetName: string;
    validFrom: Date | null;
    validTo: Date | null;
    confidence: number;
    sourceType: string | null;
  }>;
  entities: Array<{
    name: string;
    entityType: string;
    summary: string | null;
  }>;
  formattedContext: string;
}

export async function searchContextGraph(
  query: string,
  tenantId: string,
  limit: number = 20,
): Promise<GraphSearchResult> {
  const results: GraphSearchResult = { facts: [], entities: [], formattedContext: "" };

  // Stage 1a: Vector search on nodes
  let topNodeIds: string[] = [];
  if (process.env.OPENAI_API_KEY) {
    try {
      const queryEmbedding = await embedText(query);
      const vectorStr = `[${queryEmbedding.join(",")}]`;

      const nodeResults = await rawSql`
        SELECT id, name, entity_type, summary,
               1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM context_graph_nodes
        WHERE tenant_id = ${tenantId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${Math.ceil(limit / 2)}
      `;

      for (const row of nodeResults) {
        if ((row.similarity as number) > 0.45) {
          topNodeIds.push(row.id as string);
          results.entities.push({
            name: row.name as string,
            entityType: row.entity_type as string,
            summary: row.summary as string | null,
          });
        }
      }

      // Stage 1b: Vector search on edges
      const edgeResults = await rawSql`
        SELECT e.id, e.fact, e.relation_type, e.confidence, e.t_valid, e.t_invalid,
               e.source_type, e.source_node_id, e.target_node_id,
               sn.name as source_name, tn.name as target_name,
               1 - (e.embedding <=> ${vectorStr}::vector) as similarity
        FROM context_graph_edges e
        JOIN context_graph_nodes sn ON e.source_node_id = sn.id
        JOIN context_graph_nodes tn ON e.target_node_id = tn.id
        WHERE e.tenant_id = ${tenantId}
          AND e.embedding IS NOT NULL
          AND e.t_invalid IS NULL
        ORDER BY e.embedding <=> ${vectorStr}::vector
        LIMIT ${Math.ceil(limit / 2)}
      `;

      for (const row of edgeResults) {
        if ((row.similarity as number) > 0.45) {
          results.facts.push({
            fact: row.fact as string,
            relationType: row.relation_type as string,
            sourceName: row.source_name as string,
            targetName: row.target_name as string,
            validFrom: row.t_valid as Date | null,
            validTo: row.t_invalid as Date | null,
            confidence: row.confidence as number,
            sourceType: row.source_type as string | null,
          });
          topNodeIds.push(row.source_node_id as string, row.target_node_id as string);
        }
      }
    } catch (err) {
      console.warn("Vector search on graph failed:", err);
    }
  }

  // Stage 2: Graph traversal — 2-hop BFS from top matched nodes
  topNodeIds = [...new Set(topNodeIds)];
  if (topNodeIds.length > 0) {
    const hopEdges = await db.select({
      fact: contextGraphEdges.fact,
      relationType: contextGraphEdges.relationType,
      sourceNodeId: contextGraphEdges.sourceNodeId,
      targetNodeId: contextGraphEdges.targetNodeId,
      confidence: contextGraphEdges.confidence,
      tValid: contextGraphEdges.tValid,
      tInvalid: contextGraphEdges.tInvalid,
      sourceType: contextGraphEdges.sourceType,
    }).from(contextGraphEdges)
      .where(and(
        eq(contextGraphEdges.tenantId, tenantId),
        isNull(contextGraphEdges.tInvalid),
        or(
          ...topNodeIds.map(id => eq(contextGraphEdges.sourceNodeId, id)),
          ...topNodeIds.map(id => eq(contextGraphEdges.targetNodeId, id)),
        ),
      ))
      .limit(limit);

    // Get node names for the hop edges
    const allNodeIds = new Set<string>();
    for (const e of hopEdges) {
      allNodeIds.add(e.sourceNodeId);
      allNodeIds.add(e.targetNodeId);
    }

    const nodeNameMap = new Map<string, string>();
    if (allNodeIds.size > 0) {
      const nodes = await db.select({ id: contextGraphNodes.id, name: contextGraphNodes.name })
        .from(contextGraphNodes)
        .where(or(...[...allNodeIds].map(id => eq(contextGraphNodes.id, id))));
      for (const n of nodes) nodeNameMap.set(n.id, n.name);
    }

    for (const e of hopEdges) {
      const existing = results.facts.find(f => f.fact === e.fact);
      if (!existing) {
        results.facts.push({
          fact: e.fact,
          relationType: e.relationType,
          sourceName: nodeNameMap.get(e.sourceNodeId) || "?",
          targetName: nodeNameMap.get(e.targetNodeId) || "?",
          validFrom: e.tValid,
          validTo: e.tInvalid,
          confidence: e.confidence || 1,
          sourceType: e.sourceType,
        });
      }
    }
  }

  // Stage 3: Also do keyword search on node names (BM25 equivalent)
  const keywords = query.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  if (keywords.length > 0) {
    for (const kw of keywords) {
      const nameMatches = await db.select({
        id: contextGraphNodes.id,
        name: contextGraphNodes.name,
        entityType: contextGraphNodes.entityType,
        summary: contextGraphNodes.summary,
      }).from(contextGraphNodes)
        .where(and(
          eq(contextGraphNodes.tenantId, tenantId),
          ilike(contextGraphNodes.name, `%${kw}%`),
        ))
        .limit(3);

      for (const n of nameMatches) {
        if (!results.entities.find(e => e.name === n.name)) {
          results.entities.push({
            name: n.name,
            entityType: n.entityType,
            summary: n.summary,
          });
        }
      }
    }
  }

  // Format context string for injection into system prompt
  const factLines = results.facts
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit)
    .map(f => {
      const dateRange = f.validFrom
        ? `(${f.validFrom.toISOString().split("T")[0]} → ${f.validTo ? f.validTo.toISOString().split("T")[0] : "present"})`
        : "";
      return `- ${f.fact} ${dateRange} [${f.relationType}, confidence: ${(f.confidence * 100).toFixed(0)}%]`;
    });

  const entityLines = results.entities
    .slice(0, 10)
    .map(e => `- ${e.name} (${e.entityType})${e.summary ? ": " + e.summary : ""}`);

  if (factLines.length === 0 && entityLines.length === 0) {
    results.formattedContext = "";
    return results;
  }

  results.formattedContext = "\n\n## Context Graph Memory\n";
  if (entityLines.length > 0) {
    results.formattedContext += "### Entities\n" + entityLines.join("\n") + "\n";
  }
  if (factLines.length > 0) {
    results.formattedContext += "### Known Facts\n" + factLines.join("\n") + "\n";
  }

  return results;
}

// ─── 6. Graph Exploration (for chat tool) ─────────────────────

export async function exploreGraphAroundEntity(
  entityName: string,
  tenantId: string,
  depth: number = 2,
): Promise<{ nodes: Array<{ id: string; name: string; type: string; summary: string | null }>; edges: Array<{ source: string; target: string; relation: string; fact: string; valid: boolean }> }> {
  // Find the entity node
  const [node] = await db.select()
    .from(contextGraphNodes)
    .where(and(
      eq(contextGraphNodes.tenantId, tenantId),
      ilike(contextGraphNodes.name, `%${entityName}%`),
    ))
    .limit(1);

  if (!node) return { nodes: [], edges: [] };

  // BFS traversal
  const visitedNodes = new Set<string>([node.id]);
  const allNodes = [{ id: node.id, name: node.name, type: node.entityType, summary: node.summary }];
  const allEdges: Array<{ source: string; target: string; relation: string; fact: string; valid: boolean }> = [];
  let frontier = [node.id];

  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const edges = await db.select({
      id: contextGraphEdges.id,
      sourceNodeId: contextGraphEdges.sourceNodeId,
      targetNodeId: contextGraphEdges.targetNodeId,
      relationType: contextGraphEdges.relationType,
      fact: contextGraphEdges.fact,
      tInvalid: contextGraphEdges.tInvalid,
    }).from(contextGraphEdges)
      .where(and(
        eq(contextGraphEdges.tenantId, tenantId),
        or(
          ...frontier.map(id => eq(contextGraphEdges.sourceNodeId, id)),
          ...frontier.map(id => eq(contextGraphEdges.targetNodeId, id)),
        ),
      ));

    const nextFrontier = new Set<string>();
    for (const e of edges) {
      allEdges.push({
        source: e.sourceNodeId,
        target: e.targetNodeId,
        relation: e.relationType,
        fact: e.fact,
        valid: !e.tInvalid,
      });
      if (!visitedNodes.has(e.sourceNodeId)) {
        nextFrontier.add(e.sourceNodeId);
        visitedNodes.add(e.sourceNodeId);
      }
      if (!visitedNodes.has(e.targetNodeId)) {
        nextFrontier.add(e.targetNodeId);
        visitedNodes.add(e.targetNodeId);
      }
    }

    // Fetch newly discovered nodes
    const newNodeIds = [...nextFrontier];
    if (newNodeIds.length > 0) {
      const newNodes = await db.select()
        .from(contextGraphNodes)
        .where(or(...newNodeIds.map(id => eq(contextGraphNodes.id, id))));
      for (const n of newNodes) {
        allNodes.push({ id: n.id, name: n.name, type: n.entityType, summary: n.summary });
      }
    }

    frontier = [...nextFrontier];
  }

  return { nodes: allNodes, edges: allEdges };
}
