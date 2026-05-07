/**
 * Weekly cron: Anonymized cross-tenant signal aggregation (#96).
 *
 * Runs every Sunday at 3am UTC. Aggregates signal outcome data across
 * all opted-in tenants into anonymized benchmarks, enforcing k-anonymity
 * (minimum 10 distinct tenants per bucket before data is materialized).
 *
 * Privacy guarantees are enforced by the `aggregateAnonymizedSignals`
 * function in lib/anonymized-signals.ts:
 * - No PII (names, emails, domains) is stored in benchmarks
 * - Only aggregate rates and counts
 * - Tenants with settings.anonymizedDataContribution === false are excluded
 * - Buckets with fewer than 10 contributing tenants are discarded
 */

import { inngest } from "./client";
import { aggregateAnonymizedSignals } from "@/lib/scoring/anonymized-signals";

export const weeklyAnonymizedSignalAggregation = inngest.createFunction(
  {
    id: "cron-anonymized-signal-aggregation",
    name: "Weekly Anonymized Signal Aggregation",
    retries: 2,
    triggers: [{ cron: "TZ=UTC 0 3 * * 0" }], // Sundays 3am UTC
  },
  async ({ step }) => {
    const buckets = await step.run("aggregate-signals", async () => {
      return await aggregateAnonymizedSignals();
    });

    return {
      bucketsProduced: buckets.length,
      industries: [...new Set(buckets.map((b) => b.industry))].length,
      signalTypes: [...new Set(buckets.map((b) => b.signalType))].length,
      totalObservations: buckets.reduce((sum, b) => sum + b.totalObservations, 0),
    };
  },
);
