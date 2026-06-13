/**
 * Provider port (_specs/CONNECTION-GRAPH).
 *
 * The ONLY surface the rest of the feature depends on. Unipile is one
 * implementation; a self-hosted browser worker (CloakBrowser + Playwright)
 * or the test mock are others. Swapping vendor = swapping the impl behind
 * this interface, never touching the domain or ingestion logic.
 *
 * Every method returns only what the connected account's own LinkedIn
 * plan can already see — there is no privileged backend.
 */

import type { LinkedInAccountTier, RawRelation } from "../types";

/** A page of the user's first-degree relations. `rateLimited` is the
 * provider's signal that we hit the daily quota and must stop/requeue. */
export interface RelationPage {
  relations: RawRelation[];
  nextCursor: string | null;
  rateLimited: boolean;
}

/** Shared connections between the user and a target profile. `count` is
 * always available; `connectorExternalIds` is populated only when the
 * plan/provider exposes the actual list (Sales Navigator), empty otherwise. */
export interface SharedConnections {
  targetExternalId: string;
  count: number;
  connectorExternalIds: string[];
}

export interface LinkedInGraphProvider {
  /** Stable id stored on each edge (`source`) and in config. */
  readonly id: string;

  /** The connected account's plan — the ceiling on what we can fetch. */
  getAccountTier(externalAccountId: string): Promise<LinkedInAccountTier>;

  /** One page of first-degree relations. Paginate with `nextCursor`. */
  listRelations(
    externalAccountId: string,
    cursor?: string | null,
  ): Promise<RelationPage>;

  /** Mutual connections toward a cold target (the intro-path signal). */
  getSharedConnections(
    externalAccountId: string,
    targetExternalId: string,
  ): Promise<SharedConnections>;
}
