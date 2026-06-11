/**
 * ICP fit recompute — Inngest orchestration (Phase 0,
 * _specs/icp-unification R1/R3; supersedes the P1b single-step pass).
 *
 * Two triggers:
 *   - event `icp/recompute-tenant` { tenantId } — full recompute for
 *     one tenant (fired after an ICP is created/edited/deleted, by the
 *     TAM build, or by the backfill).
 *   - cron daily 05:00 UTC — fan-out: sends one recompute event per
 *     tenant owning ICP rows, so each tenant runs as its own
 *     per-tenant-serialized function instead of one giant run.
 *
 * All the math + bulk I/O lives in lib/icp/fit-recompute-core. Here we
 * only durably step it: one `step.run` per RECOMPUTE_BATCH_SIZE
 * companies, so a timeout/retry resumes from the last finished batch
 * (memoized) instead of leaving the tenant half-written — the old
 * single-step version died mid-pass on the 990-company Pilae tenant
 * (primaryIcpId reached 637/990 rows).
 *
 * Scale contract (R1): cells stay [0,1]; companies.score mirror is
 * 0-100. The summary step persists tenants.settings.lastIcpRecompute
 * for the editor's diff-after-save poll (R3.3).
 */

import { inngest } from "./client";
import { db } from "@/db";
import { icps } from "@/db/schema";
import { isNull } from "drizzle-orm";
import {
  loadActiveIcps,
  hasScorableCriteria,
  listCompanyIds,
  scoreCompanyBatch,
  writeRecomputeSummary,
  RECOMPUTE_BATCH_SIZE,
  type ActiveIcp,
  type BatchDiff,
  type RecomputeSummary,
} from "@/lib/icp/fit-recompute-core";
import { logger } from "@/lib/observability/logger";

export const icpFitRecomputeTenant = inngest.createFunction(
  {
    id: "icp-fit-recompute-tenant",
    name: "ICP fit recompute (single tenant)",
    retries: 1,
    // Serialize per tenant (a save storm queues instead of racing);
    // different tenants still run in parallel.
    concurrency: [{ limit: 1, key: "event.data.tenantId" }],
    triggers: [{ event: "icp/recompute-tenant" }],
  },
  async ({ event, step }: { event: { data: { tenantId: string } }; step: any }) => {
    const { tenantId } = event.data;

    const activeIcps: ActiveIcp[] = await step.run("load-icps", () =>
      loadActiveIcps(tenantId),
    );

    // Guard (R3.4): empty shells / people-only ICPs must not zero a
    // tenant's scores. Nothing scorable → leave matrix + scores alone.
    if (!hasScorableCriteria(activeIcps)) {
      logger.info("icp-fit-recompute.skipped_no_scorable_criteria", {
        tenantId,
        icps: activeIcps.length,
      });
      return { tenantId, skipped: true, icps: activeIcps.length };
    }

    const companyIds: string[] = await step.run("list-company-ids", () =>
      listCompanyIds(tenantId),
    );

    const agg: BatchDiff = { companies: 0, regradedUp: 0, regradedDown: 0, unowned: 0 };
    const batches = Math.ceil(companyIds.length / RECOMPUTE_BATCH_SIZE);
    for (let i = 0; i < batches; i++) {
      const diff: BatchDiff = await step.run(`score-batch-${i}`, () =>
        scoreCompanyBatch(
          tenantId,
          companyIds.slice(i * RECOMPUTE_BATCH_SIZE, (i + 1) * RECOMPUTE_BATCH_SIZE),
          activeIcps,
        ),
      );
      agg.companies += diff.companies;
      agg.regradedUp += diff.regradedUp;
      agg.regradedDown += diff.regradedDown;
      agg.unowned += diff.unowned;
    }

    const summary: RecomputeSummary = await step.run("summary", async () => {
      const s: RecomputeSummary = {
        ...agg,
        at: new Date().toISOString(),
        icps: activeIcps.length,
      };
      await writeRecomputeSummary(tenantId, s);
      return s;
    });

    logger.info("icp-fit-recompute.tenant", { tenantId, ...summary });
    return { tenantId, ...summary };
  },
);

export const icpFitRecomputeDaily = inngest.createFunction(
  {
    id: "icp-fit-recompute-daily",
    name: "Cron: ICP fit recompute (all tenants, fan-out)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "0 5 * * *" }],
  },
  async ({ step }: { step: any }) => {
    const tenants: Array<{ id: string }> = await step.run("fetch-tenants", () =>
      db
        .select({ id: icps.tenantId })
        .from(icps)
        .where(isNull(icps.deletedAt))
        .groupBy(icps.tenantId),
    );

    if (tenants.length > 0) {
      await step.sendEvent(
        "fan-out-recomputes",
        tenants.map((t) => ({
          name: "icp/recompute-tenant",
          data: { tenantId: t.id },
        })),
      );
    }
    return { tenants: tenants.length };
  },
);
