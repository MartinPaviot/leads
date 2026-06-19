/**
 * CLE-16 T13 — one-shot prune of stale learned keys for HARD_EXCLUDED_ACTIONS.
 *
 * Before CLE-16's exclusion skip, the learner could write a key for an outbound
 * class (e.g. a legacy `email-send` learned key) from action_outcomes rows. Such
 * a key is already inert at read time (buildEffectiveThresholdMap ceiling-forces
 * excluded classes + the core's hard rule), but we prune it so the stored state
 * matches the new invariant. Idempotent; safe to re-run.
 *
 * Usage:  pnpm tsx src/scripts/cle16-prune-excluded-learned.ts [--dry-run]
 */
import { HARD_EXCLUDED_ACTIONS } from "@/lib/guardrails/level-behavior";

/**
 * Pure prune: drop any learnedThresholds key in HARD_EXCLUDED_ACTIONS. Returns
 * the cleaned map + the keys removed. No IO — trivially testable (EC-8).
 */
export function pruneExcludedLearnedKeys(
  learned: Record<string, number> | undefined | null,
): { cleaned: Record<string, number>; prunedKeys: string[] } {
  const cleaned: Record<string, number> = {};
  const prunedKeys: string[] = [];
  for (const [k, v] of Object.entries(learned ?? {})) {
    if (HARD_EXCLUDED_ACTIONS.has(k as never)) prunedKeys.push(k);
    else cleaned[k] = v;
  }
  return { cleaned, prunedKeys };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { db } = await import("@/db");
  const { tenants } = await import("@/db/schema");
  const { getTenantSettings, updateTenantSettings } = await import("@/lib/config/tenant-settings");

  const rows = await db.select({ id: tenants.id }).from(tenants);
  let touched = 0;
  for (const t of rows) {
    const settings = await getTenantSettings(t.id);
    const { cleaned, prunedKeys } = pruneExcludedLearnedKeys(settings.learnedThresholds);
    if (prunedKeys.length === 0) continue;
    touched++;
    // eslint-disable-next-line no-console
    console.log(`[cle16-prune] tenant=${t.id} pruned=${JSON.stringify(prunedKeys)}${dryRun ? " (dry-run)" : ""}`);
    if (!dryRun) await updateTenantSettings(t.id, { learnedThresholds: cleaned });
  }
  // eslint-disable-next-line no-console
  console.log(`[cle16-prune] done. tenantsTouched=${touched}${dryRun ? " (dry-run, no writes)" : ""}`);
}

// Run only when executed directly (not when imported by the test).
if (process.argv[1] && process.argv[1].includes("cle16-prune-excluded-learned")) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}
