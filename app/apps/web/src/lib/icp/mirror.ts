/**
 * Flat-settings mirror sync (Phase 1, _specs/icp-unification R5.2/D2).
 *
 * The ~25 legacy consumers of tenants.settings.target* (call scripts,
 * chat context, contact scoring, warm leads, agent context…) are NOT
 * migrated — they keep reading the flats. The flats are now a read-only
 * mirror of the RANK-1 ACTIVE profile's uiState.
 *
 * Design choice: instead of "mirror if the profile being saved is rank
 * 1", every mutation that can change ranking (save, create, reorder,
 * delete, restore) calls syncRankOneMirror(tenantId), which re-derives
 * the mirror from whoever is rank 1 NOW. One idempotent code path, no
 * ordering bugs.
 *
 * A rank-1 profile WITHOUT a uiState (pre-Phase-1 / AI-created, never
 * re-saved through the editor) leaves the flats untouched — stale flats
 * beat emptied flats for the legacy readers.
 */

import { db } from "@/db";
import { icps } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { updateTenantSettings } from "@/lib/config/tenant-settings";
import {
  mirrorFromUiState,
  parseUiState,
  parseSourcingFilters,
  EMPTY_SOURCING_FILTERS,
} from "./ui-state";

export async function syncRankOneMirror(tenantId: string): Promise<
  { mirrored: true; icpId: string } | { mirrored: false; reason: string }
> {
  const [top] = await db
    .select({ id: icps.id, metadata: icps.metadata })
    .from(icps)
    .where(and(eq(icps.tenantId, tenantId), eq(icps.status, "active"), isNull(icps.deletedAt)))
    .orderBy(icps.priority, icps.createdAt)
    .limit(1);

  if (!top) return { mirrored: false, reason: "no active profile" };

  const meta = (top.metadata ?? {}) as Record<string, unknown>;
  if (meta.uiState === undefined || meta.uiState === null) {
    return { mirrored: false, reason: "rank-1 profile has no uiState" };
  }
  const ui = parseUiState(meta.uiState);
  if (!ui.ok) return { mirrored: false, reason: `invalid uiState: ${ui.error}` };

  const sfRaw = meta.sourcingFilters;
  const sf =
    sfRaw === undefined || sfRaw === null ? null : parseSourcingFilters(sfRaw);
  const sourcing = sf && sf.ok ? sf.value : EMPTY_SOURCING_FILTERS;

  await updateTenantSettings(tenantId, mirrorFromUiState(ui.value, sourcing));
  return { mirrored: true, icpId: top.id };
}
