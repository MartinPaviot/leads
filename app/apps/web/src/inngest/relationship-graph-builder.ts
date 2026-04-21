import { inngest } from "./client";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { buildKnowsFromActivities } from "@/lib/relationship-graph";
import logger from "@/lib/logger";

/**
 * Nightly rebuild of the KNOWS graph for every tenant. Cheap — reads
 * `activities` with GROUP BY and upserts edges in place. Keeps the
 * "Connected to" column fresh without the UI waiting on a lazy
 * ingestion.
 *
 * Also exposed as an event (`relationship-graph/rebuild`) for
 * per-tenant on-demand runs (e.g. triggered after a bulk contact
 * import so the graph reflects fresh activities immediately).
 */
export const nightlyRelationshipGraphBuild = inngest.createFunction(
  {
    id: "relationship-graph-nightly",
    name: "Relationship Graph: Nightly Build",
    retries: 1,
    triggers: [{ cron: "15 3 * * *" }], // 03:15 UTC daily — off-peak
  },
  async ({ step }) => {
    const tenantIds = await step.run("list-tenants", async () => {
      const rows = await db.select({ id: tenants.id }).from(tenants);
      return rows.map((r) => r.id);
    });

    let totalPairs = 0;
    let totalCreated = 0;
    let totalUpdated = 0;

    for (const tenantId of tenantIds) {
      const result = await step.run(`build-${tenantId}`, async () => {
        try {
          return await buildKnowsFromActivities(tenantId);
        } catch (err) {
          logger.warn("[relationship-graph] tenant build failed", { tenantId, err });
          return { pairsConsidered: 0, edgesCreated: 0, edgesUpdated: 0, edgesSkipped: 0 };
        }
      });
      totalPairs += result.pairsConsidered;
      totalCreated += result.edgesCreated;
      totalUpdated += result.edgesUpdated;
    }

    return {
      tenantsProcessed: tenantIds.length,
      pairsConsidered: totalPairs,
      edgesCreated: totalCreated,
      edgesUpdated: totalUpdated,
    };
  },
);

export const onDemandRelationshipGraphBuild = inngest.createFunction(
  {
    id: "relationship-graph-ondemand",
    name: "Relationship Graph: On-Demand Rebuild",
    retries: 1,
    triggers: [{ event: "relationship-graph/rebuild" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { tenantId: string } };
    step: any;
  }) => {
    const { tenantId } = event.data;
    if (!tenantId) return { error: "tenantId required" };
    return await step.run("build", async () => {
      return await buildKnowsFromActivities(tenantId);
    });
  },
);
