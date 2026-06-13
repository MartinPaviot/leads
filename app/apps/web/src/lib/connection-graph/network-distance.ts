/**
 * Network-distance normalisation (_specs/CONNECTION-GRAPH).
 *
 * Providers spell distance differently — LinkedIn/Voyager uses
 * "DISTANCE_1".."DISTANCE_3" + "OUT_OF_NETWORK", some return integers,
 * some return our own already-normalised strings. One pure mapper so the
 * rest of the graph never branches on provider quirks.
 */

import type { NetworkDistance } from "./types";

/**
 * Map any provider's distance value to our enum. Unknown / null / absent
 * → "out_of_network" (fail-safe: we never treat an unparseable value as
 * a warm connection).
 */
export function normalizeNetworkDistance(
  raw: string | number | null | undefined,
): NetworkDistance {
  if (raw === null || raw === undefined) return "out_of_network";

  if (typeof raw === "number") {
    if (raw === 1) return "first";
    if (raw === 2) return "second";
    if (raw === 3) return "third";
    return "out_of_network";
  }

  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (v) {
    case "distance_1":
    case "1st":
    case "first":
      return "first";
    case "distance_2":
    case "2nd":
    case "second":
      return "second";
    case "distance_3":
    case "3rd":
    case "third":
      return "third";
    case "out_of_network":
    case "distance_out_of_network":
      return "out_of_network";
    default:
      return "out_of_network";
  }
}

export function isFirstDegree(d: NetworkDistance): boolean {
  return d === "first";
}
