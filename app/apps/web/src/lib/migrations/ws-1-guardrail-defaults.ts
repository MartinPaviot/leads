/**
 * WS-1 migration runner — applies guardrail defaults to every tenant.
 *
 * Invoked manually by an admin via
 * `POST /api/admin/run-ws1-migration` (with `dryRun: true` for preview,
 * `dryRun: false` to execute). NOT auto-run on deploy — the brief's
 * §8.1 T5 severity tiering plus the blast-radius of changing every
 * tenant's approval-mode interpretation at once makes explicit
 * triggering the right trade-off.
 *
 * Idempotent per tenant via `settings.ws1MigrationRanAt`.
 * Safe to run multiple times; re-runs are no-ops.
 */

import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getTenantSettings,
  updateTenantSettings,
  type TenantSettings,
} from "@/lib/config/tenant-settings";
import logger from "@/lib/observability/logger";

/** Result of a single-tenant migration attempt. */
export interface TenantMigrationResult {
  tenantId: string;
  status: "skipped" | "migrated" | "dry-run";
  /** Previous `agentApprovalMode` value, pre-remap. Null if never set. */
  previousMode: TenantSettings["agentApprovalMode"] | null;
  /** Effective new value after remap. */
  newMode: TenantSettings["agentApprovalMode"];
  /** Whether the one-shot migration banner should render for this user.
   *  True only if the previous mode was `"auto"` — the remap to
   *  `"auto-high-confidence"` is a tightening they deserve to know about. */
  migrationBannerNeeded: boolean;
  /** Fields that would be (or were) seeded. */
  seededKeys: string[];
}

/** Aggregated report for a batch run. */
export interface MigrationReport {
  totalTenants: number;
  migrated: number;
  skipped: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  perTenant: TenantMigrationResult[];
}

/** Map legacy approval-mode values to v2. Undefined (no prior setting)
 *  maps to `"review-each"` per the brief's tighten-defaults principle. */
function remapApprovalMode(
  legacy: TenantSettings["agentApprovalMode"] | undefined | null,
): TenantSettings["agentApprovalMode"] {
  switch (legacy) {
    case "auto":
      return "auto-high-confidence"; // preserves the user's "let it rip" intent
    case "ask":
    case "manual":
    case "off":
    case undefined:
    case null:
      return "review-each";
    // Already v2 — leave untouched so re-running migration is a no-op.
    case "review-each":
    case "batch-daily":
    case "auto-high-confidence":
      return legacy;
    default:
      // Unknown value from a future schema; err on the conservative side.
      return "review-each";
  }
}

/** Run the migration for a single tenant. Idempotent. */
export async function migrateTenant(
  tenantId: string,
  opts: { dryRun: boolean },
): Promise<TenantMigrationResult> {
  const settings = await getTenantSettings(tenantId);

  // Idempotency guard — already migrated, bail.
  if (settings.ws1MigrationRanAt) {
    return {
      tenantId,
      status: "skipped",
      previousMode: settings.agentApprovalMode ?? null,
      newMode: settings.agentApprovalMode ?? "review-each",
      migrationBannerNeeded: false,
      seededKeys: [],
    };
  }

  const previousMode = settings.agentApprovalMode ?? null;
  const newMode = remapApprovalMode(previousMode);

  // Only tenants whose PREVIOUS mode was "auto" need the banner; everyone
  // else either stays at their v2 value or tightens from ask/manual to
  // review-each — which isn't a behavior change worth a banner because
  // ask/manual already required confirmation.
  const migrationBannerNeeded = previousMode === "auto";

  // Build the updates payload. Only seed a key if it's currently absent
  // so we never clobber values a user has already customised.
  const updates: Partial<TenantSettings> = {};
  const seededKeys: string[] = [];

  if (settings.agentApprovalMode !== newMode) {
    updates.agentApprovalMode = newMode;
    seededKeys.push("agentApprovalMode");
  }
  if (settings.sendingMailboxMode === undefined) {
    updates.sendingMailboxMode = "primary-with-caps";
    seededKeys.push("sendingMailboxMode");
  }
  if (settings.sendingDailyCapPrimary === undefined) {
    updates.sendingDailyCapPrimary = 20;
    seededKeys.push("sendingDailyCapPrimary");
  }
  if (settings.sendingAllowColdOnPrimary === undefined) {
    updates.sendingAllowColdOnPrimary = false;
    seededKeys.push("sendingAllowColdOnPrimary");
  }
  if (settings.trustScore === undefined) {
    updates.trustScore = 0.0;
    seededKeys.push("trustScore");
  }
  if (settings.autonomyNudgeState === undefined) {
    updates.autonomyNudgeState = {
      batchDailyOffered: false,
      autoHighConfidenceOffered: false,
    };
    seededKeys.push("autonomyNudgeState");
  }
  if (settings.agentMemoryPanelDiscovered === undefined) {
    updates.agentMemoryPanelDiscovered = false;
    seededKeys.push("agentMemoryPanelDiscovered");
  }
  if (
    settings.llmMonthlyCostCapUsd === undefined ||
    settings.llmMonthlyCostCapUsd === null
  ) {
    // OQ Q1 locked in plan: $50 default for all new tenants. Existing
    // tenants with a cap already set keep it.
    updates.llmMonthlyCostCapUsd = 50;
    seededKeys.push("llmMonthlyCostCapUsd");
  }

  if (opts.dryRun) {
    return {
      tenantId,
      status: "dry-run",
      previousMode,
      newMode,
      migrationBannerNeeded,
      seededKeys,
    };
  }

  updates.ws1MigrationRanAt = new Date().toISOString();

  await updateTenantSettings(tenantId, updates);

  return {
    tenantId,
    status: "migrated",
    previousMode,
    newMode,
    migrationBannerNeeded,
    seededKeys,
  };
}

/** Run the migration for every tenant in batches. */
export async function migrateAllTenants(opts: {
  dryRun: boolean;
  batchSize?: number;
  delayMsBetweenBatches?: number;
}): Promise<MigrationReport> {
  const startedAt = new Date().toISOString();
  const batchSize = opts.batchSize ?? 50;
  const delayMs = opts.delayMsBetweenBatches ?? 200;

  const allTenants = await db.select({ id: tenants.id }).from(tenants);
  const perTenant: TenantMigrationResult[] = [];
  let migrated = 0;
  let skipped = 0;

  for (let i = 0; i < allTenants.length; i += batchSize) {
    const batch = allTenants.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((t) =>
        migrateTenant(t.id, { dryRun: opts.dryRun }).catch((err): TenantMigrationResult => {
          logger.warn("ws-1 migration: tenant failed", { tenantId: t.id, err });
          return {
            tenantId: t.id,
            status: "skipped",
            previousMode: null,
            newMode: "review-each",
            migrationBannerNeeded: false,
            seededKeys: [],
          };
        }),
      ),
    );
    for (const r of batchResults) {
      perTenant.push(r);
      if (r.status === "migrated") migrated++;
      else if (r.status === "skipped") skipped++;
    }
    if (i + batchSize < allTenants.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    totalTenants: allTenants.length,
    migrated,
    skipped,
    dryRun: opts.dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    perTenant,
  };
}

/** Exported for unit tests so they can exercise the remap table without
 *  touching the DB. */
export const __internal = { remapApprovalMode };
