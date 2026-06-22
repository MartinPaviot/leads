/**
 * P1-12 (Fix 5) — nightly personalization back-test.
 *
 * 03:00 UTC: for every tenant with scored sends in the last 90 days, recompute
 * the reply-rate-by-quality-tier calibration and UPSERT one row per
 * (tenant, run_date). `retries: 0` mirrors the eval-harness cron — the UPSERT is
 * idempotent, but a retry would still be wasted work, and a missed night is
 * recovered by the next run.
 */

import { inngest } from "./client";
import { backtestTenant, listTenantsWithScoredEmails } from "@/lib/evals/personalization-backtest";
import { logger } from "@/lib/observability/logger";

export const personalizationBacktest = inngest.createFunction(
  {
    id: "personalization-backtest",
    name: "Nightly personalization back-test",
    retries: 0,
    triggers: [{ cron: "TZ=UTC 0 3 * * *" }], // 03:00 UTC daily
  },
  async ({ step }: { step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> } }) => {
    const tenants = await step.run("list-tenants", () => listTenantsWithScoredEmails(90));

    let ok = 0;
    let failed = 0;
    for (const tenantId of tenants) {
      try {
        await step.run(`backtest-${tenantId}`, async () => {
          const r = await backtestTenant(tenantId, 90);
          return { tenantId, totalScored: r.totalScored, correlation: r.correlation };
        });
        ok++;
      } catch (err) {
        // One tenant's failure must not abort the rest — log + continue.
        failed++;
        logger.error("personalization-backtest.tenant_failed", {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { tenants: tenants.length, ok, failed };
  },
);
