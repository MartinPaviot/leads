/**
 * F005 — Weekly trust threshold recalculation
 *
 * Runs weekly, queries outcome data for each tenant, recomputes
 * effective thresholds, and persists them to tenant settings.
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
