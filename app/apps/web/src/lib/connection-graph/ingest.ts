/**
 * Relation ingestion (_specs/CONNECTION-GRAPH).
 *
 * Drives the provider's paginated relations list into normalised
 * `ConnectionEdge`s, resolving each employer to a CRM company. All IO is
 * INJECTED (provider, company resolver, edge upsert, cursor save) so the
 * loop is unit-tested end-to-end with the mock provider and in-memory
 * deps — no DB, no network.
 *
 * Rate limits make this a multi-call drip, not a one-shot: the loop stops
 * at `maxPages` OR when the provider signals `rateLimited`, persisting the
 * cursor so the next run resumes where it left off.
 */

import { normalizeNetworkDistance } from "./network-distance";
import type { ConnectionEdge, RawRelation } from "./types";

export interface IngestDeps {
  listRelations: (
    cursor: string | null,
  ) => Promise<{
    relations: RawRelation[];
    nextCursor: string | null;
    rateLimited: boolean;
  }>;
  /** Resolve a relation's employer to a CRM company id (or null). */
  resolveCompany: (
    raw: { name?: string | null; domain?: string | null },
  ) => Promise<string | null> | string | null;
  /** Persist a batch of edges (upsert on (ownerUserId, personExternalId)). */
  upsertEdges: (edges: ConnectionEdge[]) => Promise<void>;
  /** Persist the resume cursor after each page. */
  saveCursor: (cursor: string | null) => Promise<void>;
}

export interface IngestParams {
  ownerUserId: string;
  tenantId: string;
  source: string;
  startCursor?: string | null;
  /** Hard cap on pages per run (rate-limit budget). */
  maxPages?: number;
}

export type IngestStopReason = "completed" | "rate_limited" | "max_pages";

export interface IngestResult {
  pages: number;
  edges: number;
  resolved: number;
  stoppedReason: IngestStopReason;
  nextCursor: string | null;
}

function toEdge(
  r: RawRelation,
  resolvedCompanyId: string | null,
  params: IngestParams,
): ConnectionEdge {
  return {
    ownerUserId: params.ownerUserId,
    tenantId: params.tenantId,
    personExternalId: r.externalId,
    personName: r.name,
    personHeadline: r.headline ?? null,
    rawCompanyName: r.companyName ?? null,
    rawCompanyDomain: r.companyDomain ?? null,
    resolvedCompanyId,
    networkDistance: normalizeNetworkDistance(r.networkDistance),
    sharedConnectionsCount: r.sharedConnectionsCount ?? 0,
    source: params.source,
  };
}

export async function ingestRelations(
  params: IngestParams,
  deps: IngestDeps,
): Promise<IngestResult> {
  const maxPages = params.maxPages ?? 10;
  let cursor: string | null = params.startCursor ?? null;
  let pages = 0;
  let edgeCount = 0;
  let resolvedCount = 0;
  let stoppedReason: IngestStopReason = "completed";

  while (pages < maxPages) {
    const page = await deps.listRelations(cursor);
    pages += 1;

    if (page.relations.length > 0) {
      const edges: ConnectionEdge[] = [];
      for (const r of page.relations) {
        // Skip junk rows with no stable id — they'd collide on upsert.
        if (!r.externalId) continue;
        const companyId = await deps.resolveCompany({
          name: r.companyName,
          domain: r.companyDomain,
        });
        if (companyId) resolvedCount += 1;
        edges.push(toEdge(r, companyId, params));
      }
      if (edges.length > 0) {
        await deps.upsertEdges(edges);
        edgeCount += edges.length;
      }
    }

    // The provider hit a quota: persist where we are and stop cleanly.
    if (page.rateLimited) {
      cursor = page.nextCursor ?? cursor;
      await deps.saveCursor(cursor);
      stoppedReason = "rate_limited";
      return {
        pages,
        edges: edgeCount,
        resolved: resolvedCount,
        stoppedReason,
        nextCursor: cursor,
      };
    }

    cursor = page.nextCursor;
    await deps.saveCursor(cursor);

    if (cursor === null) {
      stoppedReason = "completed";
      break;
    }
  }

  if (cursor !== null && stoppedReason === "completed" && pages >= maxPages) {
    stoppedReason = "max_pages";
  }

  return {
    pages,
    edges: edgeCount,
    resolved: resolvedCount,
    stoppedReason,
    nextCursor: cursor,
  };
}
