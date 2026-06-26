/**
 * Per-prospect sequence routing for the autopilot — Monaco's moat is SELECTION:
 * "a different sequence per why-now", not one cadence reworded. Today the autopilot
 * enrolls every prospect into a single `status='active' LIMIT 1` sequence; this routes
 * each prospect to the active sequence whose ICP / trigger-signal matches its company.
 *
 * Reuses the EXISTING, proven selection primitives (the same ones the signal-auto-enroll
 * path uses): `pickIcpScopedSequence` (segment-bound sequence wins) then
 * `pickSequenceForSignal` (trigger-signal match). Falls back to the most-recent active
 * sequence — identical to today's single-sequence behaviour, so nothing changes for a
 * tenant with one sequence; routing only differentiates once a tenant authors several.
 *
 * Pure given injected loaders (no db import) → unit-testable.
 */

import { pickSequenceForSignal } from "@/lib/sequences/triggers";
import { pickIcpScopedSequence } from "@/lib/icp/enrollment-routing";

export interface RouterSequence {
  id: string;
  name: string;
  icpId: string | null;
  campaignConfig: Record<string, unknown> | null;
}

export interface CompanyRouting {
  /** The company's primary ICP id, or null. */
  primaryIcpId: string | null;
  /** The company's top signal type (drives the trigger match), or null. */
  topSignalType: string | null;
}

export interface SequenceRouterDeps {
  /** The tenant's active sequences, most-recent first (for the deterministic fallback). */
  loadActiveSequences: (tenantId: string) => Promise<RouterSequence[]>;
  loadCompanyRouting: (tenantId: string, companyId: string) => Promise<CompanyRouting>;
}

/** Resolve the best-matching active sequence id for one prospect's company, or null if none. */
export async function resolveSequenceForProspect(
  tenantId: string,
  companyId: string,
  deps: SequenceRouterDeps,
): Promise<string | null> {
  const sequences = await deps.loadActiveSequences(tenantId);
  if (sequences.length === 0) return null;

  const { primaryIcpId, topSignalType } = await deps.loadCompanyRouting(tenantId, companyId);

  // 1. An ICP-bound sequence for the company's segment wins (segment-tuned messaging).
  const icp = pickIcpScopedSequence(primaryIcpId, sequences.map((s) => ({ id: s.id, icpId: s.icpId })));
  if (icp.reason === "primary_icp_match" && icp.sequenceId) return icp.sequenceId;

  // 2. Else the sequence whose trigger whitelist matches the prospect's top signal.
  if (topSignalType) {
    const picked = pickSequenceForSignal(
      sequences.map((s) => ({ id: s.id, name: s.name, campaignConfig: s.campaignConfig })),
      topSignalType,
    );
    if (picked) return picked.id;
  }

  // 3. Fallback: most-recent active sequence (today's LIMIT-1 behaviour).
  return sequences[0].id;
}
