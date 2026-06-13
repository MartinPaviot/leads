/**
 * Unipile graph provider (_specs/CONNECTION-GRAPH).
 *
 * ⚠️ DORMANT — NOT wired to anything and NOT yet exercised against the
 * live Unipile API. It exists so the provider port has a concrete vendor
 * implementation ready to validate the day Unipile is integrated. It is
 * only ever constructed by the resolver, which is gated behind
 * `isConnectionGraphEnabled()` (off in prod). The request shapes follow
 * Unipile's documented LinkedIn endpoints (relations list, profile,
 * shared connections) and WILL need a spike against a real account to
 * confirm field names + pagination + rate-limit headers before use.
 *
 * Design note: Unipile returns only what the connected account's own
 * plan shows. `getSharedConnections` therefore yields a count on free/
 * premium and the connector list on Sales Navigator.
 */

import { normalizeNetworkDistance } from "../network-distance";
import type { LinkedInAccountTier, RawRelation } from "../types";
import type {
  LinkedInGraphProvider,
  RelationPage,
  SharedConnections,
} from "./types";

export interface UnipileConfig {
  /** Unipile DSN, e.g. "https://apiXXX.unipile.com:13XXX". */
  dsn: string;
  apiKey: string;
}

/** Read Unipile config from env. Throws a clear error when unset so a
 * misconfigured enable can never silently no-op into a live call. */
export function unipileConfigFromEnv(): UnipileConfig {
  const dsn = process.env.UNIPILE_DSN;
  const apiKey = process.env.UNIPILE_API_KEY;
  if (!dsn || !apiKey) {
    throw new Error(
      "UnipileGraphProvider: UNIPILE_DSN and UNIPILE_API_KEY must be set to use the Unipile provider.",
    );
  }
  return { dsn, apiKey };
}

export class UnipileGraphProvider implements LinkedInGraphProvider {
  readonly id = "unipile";
  private readonly cfg: UnipileConfig;

  constructor(cfg: UnipileConfig) {
    this.cfg = cfg;
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(`${this.cfg.dsn}${path}`, {
      headers: { "X-API-KEY": this.cfg.apiKey, accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Unipile ${res.status} on ${path}`);
    }
    return res.json();
  }

  async getAccountTier(externalAccountId: string): Promise<LinkedInAccountTier> {
    const data = await this.get(`/api/v1/accounts/${externalAccountId}`);
    // Unipile exposes the connected LinkedIn product; map to our enum.
    const product = String(
      data?.connection_params?.im?.premiumFeatures ??
        data?.type ??
        "",
    ).toLowerCase();
    if (product.includes("sales")) return "sales_navigator";
    if (product.includes("recruiter")) return "recruiter";
    if (product.includes("premium")) return "premium";
    if (product) return "free";
    return "unknown";
  }

  async listRelations(
    externalAccountId: string,
    cursor?: string | null,
  ): Promise<RelationPage> {
    const params = new URLSearchParams({ account_id: externalAccountId, limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const data = await this.get(`/api/v1/users/relations?${params.toString()}`);

    const relations: RawRelation[] = (data?.items ?? []).map((r: any) => ({
      externalId: String(r.member_id ?? r.id ?? r.provider_id ?? ""),
      name:
        r.name ??
        [r.first_name, r.last_name].filter(Boolean).join(" ") ??
        "Unknown",
      headline: r.headline ?? null,
      companyName: r.company ?? r.current_company ?? null,
      companyDomain: r.company_domain ?? null,
      networkDistance: normalizeNetworkDistance(r.network_distance),
      sharedConnectionsCount: r.shared_connections_count ?? 0,
    }));

    // Unipile relays rate-limit state; treat an explicit 429-style flag
    // or a missing cursor with a partial page as "stop".
    const rateLimited = Boolean(data?.rate_limited);
    return {
      relations,
      nextCursor: data?.cursor ?? null,
      rateLimited,
    };
  }

  async getSharedConnections(
    externalAccountId: string,
    targetExternalId: string,
  ): Promise<SharedConnections> {
    const params = new URLSearchParams({ account_id: externalAccountId });
    const data = await this.get(
      `/api/v1/users/${targetExternalId}/shared-connections?${params.toString()}`,
    );
    return {
      targetExternalId,
      count: Number(data?.count ?? data?.items?.length ?? 0),
      connectorExternalIds: (data?.items ?? []).map((i: any) =>
        String(i.member_id ?? i.id ?? ""),
      ),
    };
  }
}
