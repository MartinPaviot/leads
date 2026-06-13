/**
 * Connection-graph feature gating (_specs/CONNECTION-GRAPH).
 *
 * The whole feature is OFF unless explicitly enabled. In production the
 * env is unset, so `isConnectionGraphEnabled()` returns false, the
 * provider resolver returns null, and the ingestion job early-returns.
 * Nothing touches LinkedIn or Unipile. Mirrors the prod-hidden gating
 * pattern of billing/TAM-proposals.
 */

export function isConnectionGraphEnabled(): boolean {
  return (process.env.LINKEDIN_GRAPH_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Which provider implementation to use: "unipile" | "mock" | "self_hosted".
 * Null when unset — the resolver then returns no provider. */
export function configuredGraphProviderId(): string | null {
  const v = (process.env.LINKEDIN_GRAPH_PROVIDER ?? "").trim().toLowerCase();
  return v || null;
}
