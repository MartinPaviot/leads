/**
 * Warm-path scoring (_specs/CONNECTION-GRAPH).
 *
 * Two kinds of warm path, two inputs:
 *
 *  - INSIDER — the founder has a 1st-degree connection working AT the
 *    target account. Computed from edges alone (cheap; comes free with
 *    the relations list). Strongest path.
 *
 *  - INTRO_PATH — for a specific cold contact, the founder's 1st-degree
 *    connections are mutual connections of that contact, so they can
 *    introduce. Needs per-target shared-connection data (expensive,
 *    rate-limited; only fetched for high-priority targets). We only count
 *    mutuals that are ALSO the founder's own connections — those are the
 *    people he can actually ask.
 *
 * Pure — no DB, no provider. Strengths are deliberately simple and
 * documented rather than falsely precise.
 */

import type {
  ConnectionEdge,
  WarmConnector,
  WarmPath,
} from "./types";

const INSIDER_BASE = 0.8;
const INSIDER_PER_EXTRA = 0.04;
const INTRO_BASE = 0.3;
const INTRO_PER_EXTRA = 0.06;
const INTRO_CAP = 0.6;

function toConnector(e: ConnectionEdge): WarmConnector {
  return {
    personExternalId: e.personExternalId,
    personName: e.personName,
    networkDistance: e.networkDistance,
  };
}

/**
 * Insider path into an account, from the founder's edges. A first-degree
 * connection whose resolved employer IS the target company is an insider.
 * Strength saturates toward 1.0 as more insiders pile up.
 */
export function computeAccountWarmPath(
  companyId: string,
  edges: ConnectionEdge[],
): WarmPath {
  const insiders = edges.filter(
    (e) =>
      e.networkDistance === "first" && e.resolvedCompanyId === companyId,
  );

  if (insiders.length === 0) {
    return { kind: "none", strength: 0, connectors: [] };
  }

  const strength = Math.min(
    1,
    INSIDER_BASE + INSIDER_PER_EXTRA * (insiders.length - 1),
  );
  return {
    kind: "insider",
    strength,
    connectors: insiders.map(toConnector),
  };
}

/**
 * Intro path toward a cold contact. `sharedConnectorExternalIds` is the
 * provider's list of people who connect the founder to the target; we
 * intersect it with the founder's own first-degree edges so the
 * connectors we surface are people he can genuinely reach out to.
 * When the provider only returns a COUNT (no list), pass `sharedCount`
 * and an empty id list — we degrade to a count-based strength with no
 * named connectors.
 */
export function computeContactIntroPath(
  edges: ConnectionEdge[],
  shared: { connectorExternalIds: string[]; count: number },
): WarmPath {
  const firstDegreeById = new Map(
    edges
      .filter((e) => e.networkDistance === "first")
      .map((e) => [e.personExternalId, e]),
  );

  const namedConnectors: WarmConnector[] = [];
  for (const id of shared.connectorExternalIds) {
    const edge = firstDegreeById.get(id);
    if (edge) namedConnectors.push(toConnector(edge));
  }

  // Effective connector count: prefer the named intersection; fall back
  // to the raw count when the plan only exposes a number.
  const effective =
    namedConnectors.length > 0
      ? namedConnectors.length
      : Math.max(0, shared.count);

  if (effective === 0) {
    return { kind: "none", strength: 0, connectors: [] };
  }

  const strength = Math.min(
    INTRO_CAP,
    INTRO_BASE + INTRO_PER_EXTRA * (effective - 1),
  );
  return { kind: "intro_path", strength, connectors: namedConnectors };
}

/** Pick the stronger of two paths (insider beats intro on equal strength
 * because a named insider is more actionable than a count). */
export function bestWarmPath(a: WarmPath, b: WarmPath): WarmPath {
  if (a.strength !== b.strength) return a.strength > b.strength ? a : b;
  if (a.kind === b.kind) return a;
  return a.kind === "insider" ? a : b;
}
