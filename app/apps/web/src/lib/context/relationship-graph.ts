/**
 * Relationship graph — the "Connected to" layer.
 *
 * Monaco surfaces a column on the TAM table showing which team member
 * has a warm relationship with each target account. For founder-led
 * sales that column is the single highest-conversion signal. We
 * already ship a bi-temporal knowledge graph (`context_graph_edges`);
 * this module adds a `KNOWS` relation type on top of it and the
 * ingestion + query helpers callers need.
 *
 * Architecture decision: no schema migration. `relation_type` is
 * already a free-text column with an index; introducing "KNOWS"
 * costs zero. That keeps the primitive additive — a tenant that
 * never calls the builder sees no graph overhead.
 *
 * Ingestion heuristic (v0): frequency of outbound email from a tenant
 * user to an external contact. 2+ emails = at least a weak tie.
 * Confidence caps at 1.0 around ~100 emails via a log curve so a few
 * heavy threads don't over-dominate. Later signals (calendar meetings,
 * Slack DMs, LinkedIn connection exports) plug in through the same
 * `upsertKnowsEdge` entry point.
 */

import { db } from "@/db";
import {
  activities,
  contacts,
  contextGraphEdges,
  contextGraphNodes,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export const KNOWS = "KNOWS";

export interface WarmPath {
  /** App user who knows someone at the target account. */
  viaUserId: string;
  viaUserName: string;
  /** Contact at the target company that the user knows. */
  contactId: string;
  contactName: string;
  contactTitle: string | null;
  /** 0–1 confidence from the underlying edge. */
  strength: number;
  /** Primary signal source that populated the edge. */
  channel: string;
  /** Last interaction (ISO string) so callers can show "3 days ago". */
  lastInteractionAt: string | null;
}

// ─── Node helpers ─────────────────────────────────────────────

/**
 * Lazy-create a context-graph node for a first-party entity
 * (user or contact). We key on (tenantId, entityType, entityId) to
 * avoid ever creating two nodes for the same underlying row.
 */
async function getOrCreatePersonNode(params: {
  tenantId: string;
  entityId: string;
  name: string;
  summary?: string | null;
}): Promise<string> {
  const { tenantId, entityId, name, summary } = params;

  const [existing] = await db
    .select({ id: contextGraphNodes.id })
    .from(contextGraphNodes)
    .where(
      and(
        eq(contextGraphNodes.tenantId, tenantId),
        eq(contextGraphNodes.entityType, "person"),
        eq(contextGraphNodes.entityId, entityId),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(contextGraphNodes)
    .values({
      tenantId,
      entityType: "person",
      entityId,
      name,
      summary: summary ?? null,
    })
    .returning({ id: contextGraphNodes.id });

  return created.id;
}

// ─── Confidence curve ─────────────────────────────────────────

/**
 * Map an interaction count to a confidence in [0, 1].
 *   1 interaction  → 0    (no edge — `shouldEmitEdge` rejects)
 *   2 interactions → ~0.30
 *   5              → ~0.50
 *   20             → ~0.72
 *   50             → ~0.85
 *   100+           → ~0.95 (saturates)
 *
 * We never return exactly 1.0 — frequency alone is never certainty,
 * it's a strong prior. Explicit channels (a shared meeting, a
 * mutual-intro email) are what push us past 0.95.
 */
export function interactionsToConfidence(count: number): number {
  if (count < 2) return 0;
  const raw = Math.log10(count + 1) / 2.2;
  return Math.min(0.95, Math.max(0, raw));
}

export function shouldEmitEdge(count: number): boolean {
  return count >= 2;
}

// ─── Builder ──────────────────────────────────────────────────

/**
 * Aggregate outbound emails + meetings per (user, contact) pair and
 * upsert a KNOWS edge. Re-running is safe: existing valid edges get
 * their confidence + metadata updated in place; we never create a
 * second KNOWS edge between the same pair.
 *
 * Returns counts for observability.
 */
export async function buildKnowsFromActivities(tenantId: string): Promise<{
  pairsConsidered: number;
  edgesCreated: number;
  edgesUpdated: number;
  edgesSkipped: number;
}> {
  // Aggregate by (user, contact) over outbound activities. We count
  // emails + meetings + calls — any direct interaction with a named
  // contact counts as an observation.
  // Aggregate by (user, contact). The activities table uses a
  // polymorphic (actorType, actorId, entityType, entityId) shape —
  // there are no dedicated `userId` / `contactId` columns. We filter
  // on the type discriminators and project `actorId → userId`,
  // `entityId → contactId` for the edge-building loop below.
  const rows = await db
    .select({
      userId: activities.actorId,
      contactId: activities.entityId,
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${activities.occurredAt})`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.direction, "outbound"),
        eq(activities.actorType, "user"),
        eq(activities.entityType, "contact"),
      ),
    )
    .groupBy(activities.actorId, activities.entityId);

  const filtered = rows.filter(
    (r): r is typeof r & { userId: string; contactId: string } =>
      typeof r.userId === "string" &&
      r.userId.length > 0 &&
      typeof r.contactId === "string" &&
      r.contactId.length > 0 &&
      shouldEmitEdge(Number(r.count ?? 0)),
  );

  let edgesCreated = 0;
  let edgesUpdated = 0;
  let edgesSkipped = 0;

  for (const row of filtered) {
    const [user] = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    const [contact] = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .where(and(eq(contacts.id, row.contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);

    if (!user || !contact) {
      edgesSkipped++;
      continue;
    }

    const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Unknown user";
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Unknown contact";

    const userNodeId = await getOrCreatePersonNode({
      tenantId,
      entityId: user.id,
      name: userName,
    });
    const contactNodeId = await getOrCreatePersonNode({
      tenantId,
      entityId: contact.id,
      name: contactName,
    });

    const confidence = interactionsToConfidence(Number(row.count));
    const lastAtIso = row.lastAt ? new Date(row.lastAt).toISOString() : null;

    const [existing] = await db
      .select({ id: contextGraphEdges.id, metadata: contextGraphEdges.metadata, confidence: contextGraphEdges.confidence })
      .from(contextGraphEdges)
      .where(
        and(
          eq(contextGraphEdges.tenantId, tenantId),
          eq(contextGraphEdges.sourceNodeId, userNodeId),
          eq(contextGraphEdges.targetNodeId, contactNodeId),
          eq(contextGraphEdges.relationType, KNOWS),
          isNull(contextGraphEdges.tInvalid),
        ),
      )
      .limit(1);

    const metadata = {
      channel: "email",
      interactionCount: Number(row.count),
      lastInteractionAt: lastAtIso,
      source: "activities.outbound",
    };

    if (existing) {
      await db
        .update(contextGraphEdges)
        .set({ confidence, metadata, fact: `${userName} knows ${contactName} (${row.count} outbound interactions)` })
        .where(eq(contextGraphEdges.id, existing.id));
      edgesUpdated++;
    } else {
      await db.insert(contextGraphEdges).values({
        tenantId,
        sourceNodeId: userNodeId,
        targetNodeId: contactNodeId,
        relationType: KNOWS,
        fact: `${userName} knows ${contactName} (${row.count} outbound interactions)`,
        confidence,
        sourceType: "activity",
        metadata,
      });
      edgesCreated++;
    }
  }

  return {
    pairsConsidered: rows.length,
    edgesCreated,
    edgesUpdated,
    edgesSkipped,
  };
}

// ─── Query ────────────────────────────────────────────────────

/**
 * Return warm paths from any tenant user to contacts at `companyId`.
 * One-hop only in v0 (user → contact directly); two-hop (user → intro
 * person → contact) is a follow-up.
 */
export async function findWarmPathsToCompany(params: {
  tenantId: string;
  companyId: string;
}): Promise<WarmPath[]> {
  const byCompany = await findWarmPathsToCompanies({
    tenantId: params.tenantId,
    companyIds: [params.companyId],
  });
  return byCompany.get(params.companyId) ?? [];
}

/**
 * Batched version — one SQL round-trip per N accounts instead of N.
 * The accounts list page uses this to populate the "Connected to"
 * column without N+1 network calls.
 */
export async function findWarmPathsToCompanies(params: {
  tenantId: string;
  companyIds: string[];
}): Promise<Map<string, WarmPath[]>> {
  const { tenantId, companyIds } = params;
  const result = new Map<string, WarmPath[]>();
  for (const id of companyIds) result.set(id, []);
  if (companyIds.length === 0) return result;

  // Join: edges where sourceNode is a user AND targetNode is a
  // contact that works at one of the requested companies. Single
  // round-trip regardless of batch size via `IN (...)` on companyIds.
  const rows = await db
    .select({
      edgeConfidence: contextGraphEdges.confidence,
      edgeMetadata: contextGraphEdges.metadata,
      userId: users.id,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      userEmail: users.email,
      contactId: contacts.id,
      contactCompanyId: contacts.companyId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      contactTitle: contacts.title,
    })
    .from(contextGraphEdges)
    .innerJoin(
      contextGraphNodes,
      eq(contextGraphEdges.sourceNodeId, contextGraphNodes.id),
    )
    .innerJoin(users, eq(contextGraphNodes.entityId, users.id))
    .innerJoin(
      // Resolve the contact through the edge's target node. Drizzle
      // can't re-alias `contextGraphNodes` in a single chain so the
      // target-side node lookup stays in a correlated subquery.
      contacts,
      and(
        eq(contacts.tenantId, tenantId),
        inArray(contacts.companyId, companyIds),
        eq(
          contextGraphEdges.targetNodeId,
          sql`(SELECT id FROM ${contextGraphNodes} WHERE ${contextGraphNodes.tenantId} = ${tenantId} AND ${contextGraphNodes.entityType} = 'person' AND ${contextGraphNodes.entityId} = ${contacts.id} LIMIT 1)`,
        ),
      ),
    )
    .where(
      and(
        eq(contextGraphEdges.tenantId, tenantId),
        eq(contextGraphEdges.relationType, KNOWS),
        isNull(contextGraphEdges.tInvalid),
        eq(contextGraphNodes.entityType, "person"),
      ),
    );

  for (const row of rows) {
    if (!row.contactCompanyId) continue;
    const userName = [row.userFirstName, row.userLastName].filter(Boolean).join(" ") || row.userEmail || "Unknown user";
    const contactName = [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ") || row.contactEmail || "Unknown contact";
    const meta = (row.edgeMetadata ?? {}) as Record<string, unknown>;
    const list = result.get(row.contactCompanyId);
    if (!list) continue;
    list.push({
      viaUserId: row.userId,
      viaUserName: userName,
      contactId: row.contactId,
      contactName,
      contactTitle: row.contactTitle,
      strength: row.edgeConfidence ?? 0,
      channel: (meta.channel as string) ?? "email",
      lastInteractionAt: (meta.lastInteractionAt as string) ?? null,
    });
  }

  // Strongest ties first so "Connected to" column surfaces the warmest
  // path at a glance.
  for (const list of result.values()) {
    list.sort((a, b) => b.strength - a.strength);
  }
  return result;
}
