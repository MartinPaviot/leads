import { inngest } from "./client";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { hydrateExistingAccounts } from "@/lib/linkedin/account-hydration";
import { selectSeatsPerTenant } from "@/lib/linkedin/hydration-seat";

/**
 * Spec 36 (T11) — daily, bounded hydration of existing accounts with their real
 * LinkedIn firmographics, for every tenant that has a connected Sales-Navigator
 * seat. OFF by default behind LINKEDIN_ACCOUNT_HYDRATION_ENABLED: it spends the
 * seat's LinkedIn profile-view quota (~1-2 views/company), so flipping it on is a
 * deliberate ops decision (mirrors LINKEDIN_INBOUND_ENABLED / DAILY_AUTOPILOT_ENABLED).
 *
 * Bounded: LINKEDIN_ACCOUNT_HYDRATION_LIMIT companies probed/tenant/run (default
 * 10, ≤50) — hydrateExistingAccounts then SQL-excludes already-matched + recently
 * no-match rows, so successive days walk the un-hydrated tail instead of
 * re-spending quota. Per-seat exposure is ~limit×(1-2) views/day, well under the
 * seat's own ~100/day. Mirrors linkedin-inbox-sync: concurrency 1, dead-letter
 * onFailure, and per-tenant fault isolation so one tenant's error can't starve
 * the rest of the run.
 */
export const linkedinAccountHydrationCron = inngest.createFunction(
  {
    id: "linkedin-account-hydration",
    name: "Cron: LinkedIn account hydration",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("linkedin-account-hydration.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "TZ=UTC 0 5 * * *" }], // 05:00 UTC daily
  },
  async ({ step }) => {
    const flag = process.env.LINKEDIN_ACCOUNT_HYDRATION_ENABLED;
    if (flag !== "true" && flag !== "1") return { enabled: false };
    if (!readUnipileConfig()) return { enabled: true, reason: "no_unipile_config" };

    const perTenant = await step.run("load-seats", async () => {
      const rows = await db
        .select({
          tenantId: linkedinAccount.tenantId,
          status: linkedinAccount.status,
          unipileAccountId: linkedinAccount.unipileAccountId,
          seatType: linkedinAccount.seatType,
          userId: linkedinAccount.userId,
        })
        .from(linkedinAccount)
        .where(eq(linkedinAccount.status, "connected"));
      return selectSeatsPerTenant(rows);
    });

    const perTenantLimit = Math.max(1, Math.min(50, Number(process.env.LINKEDIN_ACCOUNT_HYDRATION_LIMIT) || 10));
    const totals = { tenants: 0, hydrated: 0, skippedNoMatch: 0, segmentsPreserved: 0, failedTenants: 0, budgetExhaustedTenants: 0 };

    for (const [tenantId, unipileAccountId] of perTenant) {
      // Per-tenant fault isolation: a hard error on one tenant must not abort the
      // rest of the run (the catch is INSIDE step.run so the step itself succeeds).
      const r = await step.run(`hydrate-${tenantId}`, async () => {
        try {
          const res = await hydrateExistingAccounts({ tenantId, unipileAccountId, limit: perTenantLimit, onlyUnhydrated: true });
          return { ...res, failed: false };
        } catch (err) {
          logger.warn("linkedin-account-hydration.tenant_failed", {
            tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
          return { processed: 0, hydrated: 0, skippedNoMatch: 0, segmentsPreserved: 0, budgetExhausted: false, failed: true };
        }
      });
      totals.tenants++;
      totals.hydrated += r.hydrated;
      totals.skippedNoMatch += r.skippedNoMatch;
      totals.segmentsPreserved += r.segmentsPreserved;
      if (r.failed) totals.failedTenants++;
      if (r.budgetExhausted) totals.budgetExhaustedTenants++;
    }

    logger.info("linkedin-account-hydration.run_done", totals);
    return { enabled: true, ...totals };
  },
);
