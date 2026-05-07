/**
 * Hourly cron — expire stale `pending_approval` drafts.
 *
 * P0-1 task 1.5. Iterates per-tenant : reads each tenant's
 * `draftExpiryHours` setting (default 72), computes the cutoff,
 * marks every still-pending draft older than the cutoff as
 * `expired`. The expiry is terminal — the rejection-learner doesn't
 * fire on this path because the founder didn't actually reject it,
 * the draft just timed out.
 *
 * Concurrency : single-flight (`concurrency.limit = 1`) so two cron
 * fires don't race. The pure-function predicate is in
 * `lib/sequence-drafts/expiry.ts` ; this is the IO orchestrator.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { sequenceDrafts, tenants } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import {
  resolveExpiryHours,
  expiryCutoff,
} from "@/lib/sequence-drafts/expiry";
import { logger } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

export const cronExpireSequenceDrafts = inngest.createFunction(
  {
    id: "cron-expire-sequence-drafts",
    name: "Cron: Expire Pending Sequence Drafts",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }) => {
      logger.error("cron-expire-sequence-drafts.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "0 * * * *" }], // top of every hour
  },
  async ({ step }: {
    step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> };
  }) => {
    const now = new Date();

    // 1) Fetch all tenants — each may have a different
    // draftExpiryHours setting, so we expire per-tenant rather than
    // applying a single global cutoff.
    const allTenants = await step.run("fetch-tenants", async () =>
      db
        .select({ id: tenants.id, settings: tenants.settings })
        .from(tenants),
    );

    let totalExpired = 0;
    const perTenant: Array<{ tenantId: string; expired: number; cutoff: string }> = [];

    for (const t of allTenants) {
      const hours = resolveExpiryHours(
        t.settings as Record<string, unknown> | null,
      );
      const cutoff = expiryCutoff(now, hours);

      // Atomic update — every pending draft generated before cutoff
      // flips to `expired` in a single statement. No row-by-row loop.
      const updated = await step.run(`expire-${t.id}`, async () => {
        const result = await db
          .update(sequenceDrafts)
          .set({
            status: "expired",
            reviewedAt: now,
            reviewedBy: "system",
            reviewReason: `Expired after ${hours}h pending`,
            updatedAt: now,
          })
          .where(
            and(
              eq(sequenceDrafts.tenantId, t.id),
              eq(sequenceDrafts.status, "pending_approval"),
              lt(sequenceDrafts.generatedAt, cutoff),
            ),
          )
          .returning({ id: sequenceDrafts.id });
        return result.length;
      });

      if (updated > 0) {
        metrics.increment("sequence_drafts.expired", {
          tenantId: t.id,
          hours,
        });
      }
      totalExpired += updated;
      perTenant.push({ tenantId: t.id, expired: updated, cutoff: cutoff.toISOString() });
    }

    return {
      totalExpired,
      tenantsScanned: allTenants.length,
      perTenant: perTenant.filter((p) => p.expired > 0),
    };
  },
);
