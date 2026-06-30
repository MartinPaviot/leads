import { inngest } from "./client";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { hydrateExistingContacts } from "@/lib/linkedin/contact-hydration";
import { connectedSeatsPerTenant } from "@/lib/linkedin/hydration-seat";

/**
 * Spec 36 (T11) — daily, bounded enrichment of existing contacts with their full
 * LinkedIn profile (warm engagers first). The contact counterpart of the account-
 * hydration cron, and the autonomous side of #513.
 *
 * OFF by default behind LINKEDIN_CONTACT_HYDRATION_ENABLED. Runs at 07:00 UTC —
 * AFTER the account-hydration (05:00) and engagement (06:00) crons, and shares
 * the SAME per-seat daily view budget (LINKEDIN_DAILY_VIEW_CAP), so the three
 * together never exceed the seat's ~100 profile-views/day; a contact run that
 * finds the budget already spent stops gracefully (budgetExhausted). Bounded by
 * LINKEDIN_CONTACT_HYDRATION_LIMIT (default 10) contacts probed/tenant/run.
 * Per-tenant fault isolation + onFailure dead-letter, mirroring the sibling crons.
 */
export const linkedinContactHydrationCron = inngest.createFunction(
  {
    id: "linkedin-contact-hydration",
    name: "Cron: LinkedIn contact hydration",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("linkedin-contact-hydration.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "TZ=UTC 0 7 * * *" }], // 07:00 UTC daily
  },
  async ({ step }) => {
    const flag = process.env.LINKEDIN_CONTACT_HYDRATION_ENABLED;
    if (flag !== "true" && flag !== "1") return { enabled: false };
    if (!readUnipileConfig()) return { enabled: true, reason: "no_unipile_config" };

    const perTenant = await step.run("connected-seats", async () => {
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
      return connectedSeatsPerTenant(rows);
    });

    const perTenantLimit = Math.max(1, Math.min(50, Number(process.env.LINKEDIN_CONTACT_HYDRATION_LIMIT) || 10));
    const totals = { tenants: 0, hydrated: 0, skippedNoProfile: 0, budgetExhaustedTenants: 0, failedTenants: 0 };

    for (const [tenantId, unipileAccountId] of perTenant) {
      const r = await step.run(`hydrate-${tenantId}`, async () => {
        try {
          const res = await hydrateExistingContacts({ tenantId, unipileAccountId, limit: perTenantLimit, onlyUnhydrated: true });
          return { ...res, failed: false };
        } catch (err) {
          logger.warn("linkedin-contact-hydration.tenant_failed", {
            tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
          return { processed: 0, hydrated: 0, skippedNoProfile: 0, budgetExhausted: false, failed: true };
        }
      });
      totals.tenants++;
      totals.hydrated += r.hydrated;
      totals.skippedNoProfile += r.skippedNoProfile;
      if (r.budgetExhausted) totals.budgetExhaustedTenants++;
      if (r.failed) totals.failedTenants++;
    }

    logger.info("linkedin-contact-hydration.run_done", totals);
    return { enabled: true, ...totals };
  },
);
