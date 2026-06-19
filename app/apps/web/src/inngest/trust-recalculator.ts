/**
 * F005 — Weekly trust threshold recalculation
 *
 * Runs weekly, queries outcome data for each tenant, recomputes
 * effective thresholds, and persists them to tenant settings.
 *
 * CLE-16: `recalculateThresholds` now (a) skips the hard-excluded outbound
 * classes (never writes a learnable bar for them), (b) updates incrementally
 * from the previous learned value (bounded [0.5, 1.0]), (c) folds CLE-11
 * reversal/bounce as a bad-outcome signal, and (d) emits a structured
 * `learned-threshold.update` log line per changed class. The cadence (weekly,
 * Mon 04:00 UTC) and the per-tenant isolation are unchanged — the new signal +
 * observability live inside the function the cron already calls per tenant.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { recalculateThresholds } from "@/lib/guardrails/learned-trust";

export const weeklyTrustRecalculation = inngest.createFunction(
  {
    id: "weekly-trust-recalculation",
    retries: 1,
    triggers: [{ cron: "0 4 * * 1" }], // Monday 4am UTC
  },
  async ({ step }: { step: any }) => {
    const allTenants = await step.run("list-tenants", async () => {
      return db.select({ id: tenants.id }).from(tenants);
    });

    let updated = 0;
    for (const tenant of allTenants) {
      await step.run(`recalc-${tenant.id}`, async () => {
        const newThresholds = await recalculateThresholds(tenant.id);
        if (Object.keys(newThresholds).length > 0) updated++;
        return newThresholds;
      });
    }

    return { tenantsProcessed: allTenants.length, updated };
  },
);
