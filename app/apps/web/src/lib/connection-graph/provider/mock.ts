/**
 * Mock graph provider (_specs/CONNECTION-GRAPH).
 *
 * Deterministic, in-memory. Powers the unit tests and local dev so the
 * full ingestion + overlay + warm-path pipeline can be exercised with
 * zero network and zero LinkedIn account. Paginates a fixture list to
 * mimic the real drip, and can be told to signal a rate limit at a given
 * page to test the stop-and-requeue path.
 */

import type { LinkedInAccountTier, RawRelation } from "../types";
import type {
  LinkedInGraphProvider,
  RelationPage,
  SharedConnections,
} from "./types";

export interface MockProviderConfig {
  tier?: LinkedInAccountTier;
  relations: RawRelation[];
  pageSize?: number;
  /** 0-based page index at which to report rateLimited (then stop). */
  rateLimitAtPage?: number;
  /** target externalId → shared connections to return. */
  shared?: Record<string, SharedConnections>;
}

export class MockGraphProvider implements LinkedInGraphProvider {
  readonly id = "mock";
  private readonly cfg: Required<Pick<MockProviderConfig, "relations" | "pageSize">> &
    MockProviderConfig;

  constructor(config: MockProviderConfig) {
    this.cfg = {
      pageSize: config.pageSize ?? 50,
      ...config,
    };
  }

  async getAccountTier(): Promise<LinkedInAccountTier> {
    return this.cfg.tier ?? "free";
  }

  async listRelations(
    _externalAccountId: string,
    cursor?: string | null,
  ): Promise<RelationPage> {
    const pageSize = this.cfg.pageSize;
    const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const pageIndex = Math.floor(start / pageSize);

    if (
      this.cfg.rateLimitAtPage !== undefined &&
      pageIndex >= this.cfg.rateLimitAtPage
    ) {
      return { relations: [], nextCursor: String(start), rateLimited: true };
    }

    const slice = this.cfg.relations.slice(start, start + pageSize);
    const nextStart = start + slice.length;
    const hasMore = nextStart < this.cfg.relations.length;
    return {
      relations: slice,
      nextCursor: hasMore ? String(nextStart) : null,
      rateLimited: false,
    };
  }

  async getSharedConnections(
    _externalAccountId: string,
    targetExternalId: string,
  ): Promise<SharedConnections> {
    return (
      this.cfg.shared?.[targetExternalId] ?? {
        targetExternalId,
        count: 0,
        connectorExternalIds: [],
      }
    );
  }
}
