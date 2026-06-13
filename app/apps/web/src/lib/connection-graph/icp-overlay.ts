/**
 * ICP overlay (_specs/CONNECTION-GRAPH) — the quick win.
 *
 * "You're already connected to 14 people at ICP-fit accounts." Takes the
 * founder's first-degree edges (resolved to companies) and the
 * company→fit map (from company_icp_fit) and returns the warm assets,
 * ranked by fit. Pure — no DB, no provider.
 */

import type { CompanyFit, ConnectionEdge, WarmAsset } from "./types";

export interface IcpOverlayOptions {
  /** Minimum primary-ICP fit for a company to count as "in the ICP".
   * Mirrors the engine's PRIMARY_FIT_THRESHOLD (0.5). */
  minFit?: number;
}

/**
 * Compute the first-degree × ICP overlay.
 *
 * Only first-degree, company-resolved edges qualify (a 2nd-degree person
 * is an intro target, handled by warm-path, not a warm asset you already
 * hold). Ties on fit break by person name for stable ordering.
 */
export function computeIcpOverlay(
  edges: ConnectionEdge[],
  fitByCompany: Map<string, CompanyFit>,
  options: IcpOverlayOptions = {},
): WarmAsset[] {
  const minFit = options.minFit ?? 0.5;
  const assets: WarmAsset[] = [];

  for (const edge of edges) {
    if (edge.networkDistance !== "first") continue;
    if (!edge.resolvedCompanyId) continue;
    const fit = fitByCompany.get(edge.resolvedCompanyId);
    if (!fit) continue;
    if (fit.fitScore < minFit) continue;
    assets.push({
      edge,
      companyId: edge.resolvedCompanyId,
      fitScore: fit.fitScore,
      icpId: fit.icpId,
    });
  }

  assets.sort(
    (a, b) =>
      b.fitScore - a.fitScore ||
      a.edge.personName.localeCompare(b.edge.personName),
  );
  return assets;
}

/** Count of distinct ICP-fit accounts the founder has an insider at. */
export function countWarmIcpAccounts(assets: WarmAsset[]): number {
  return new Set(assets.map((a) => a.companyId)).size;
}
