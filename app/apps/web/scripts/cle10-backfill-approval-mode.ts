/**
 * CLE-10 — one-shot data backfill (deploy-time migration; NOT run by the harness).
 *
 * For every `autonomy_config` row, derive the canonical ApprovalModeV2 from the
 * tenant's autonomy LEVEL (+ trust score for strategic relaxation) and write it into
 * that tenant's `agentApprovalMode` settings cache, so even row-less background readers
 * (which use `readApprovalMode`, not the autonomy row) converge on the level-derived
 * posture. (design.md §4.4.)
 *
 * Properties:
 *  - IDEMPOTENT: re-running yields the same value (derivation is pure); a second run
 *    logs an empty change set.
 *  - Tenants with NO autonomy_config row are SKIPPED (EC-4 — their stored mode is
 *    already authoritative; CLE-10 is additive for them).
 *  - Logs every (tenantId, oldMode, newMode) for review.
 *
 * Usage:
 *   --dry     print the plan, write nothing.
 *   (no flag) apply the writes.
 *
 * DO NOT run inside the harness — it needs production DB credentials. Run it once at
 * deploy time, capturing output to _research/raw/cle10-backfill-<date>.log.
 */

import { db } from "@/db";
import { autonomyConfig } from "@/db/schema";
import { getTrustScore } from "@/lib/campaign-engine/trust-score";
import {
  deriveApprovalModeFromLevel,
  readApprovalMode,
} from "@/lib/guardrails/approval-mode";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`CLE-10 approval-mode backfill — ${dry ? "DRY RUN (no writes)" : "APPLYING"}`);

  const rows = await db
    .select({ tenantId: autonomyConfig.tenantId, level: autonomyConfig.level })
    .from(autonomyConfig);

  console.log(`autonomy_config rows: ${rows.length}`);

  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const settings = await getTenantSettings(row.tenantId);
    const oldMode = readApprovalMode(settings);
    const trust = await getTrustScore(row.tenantId);
    const { mode: newMode } = deriveApprovalModeFromLevel(
      (row.level as AutonomyLevel) ?? "copilot",
      trust.overall,
    );

    // Compare against the RAW stored value too, so a tenant whose disk value is a
    // legacy literal (e.g. "auto") that coerces to the same effective mode is still
    // rewritten to the canonical v2 value once (idempotent thereafter).
    const rawStored = settings.agentApprovalMode;
    const needsWrite = rawStored !== newMode;

    if (needsWrite) {
      console.log(
        `  ${row.tenantId}  level=${row.level}  ${oldMode}(raw:${rawStored ?? "unset"}) -> ${newMode}`,
      );
      if (!dry) {
        await updateTenantSettings(row.tenantId, { agentApprovalMode: newMode });
      }
      changed++;
    } else {
      unchanged++;
    }
  }

  console.log(
    `Done. changed=${changed} unchanged=${unchanged} skipped(no row)=tenants-without-autonomy_config`,
  );

  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
