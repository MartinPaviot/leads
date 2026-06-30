import { inngest } from "./client";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { readUnipileConfig, getUnipileOwnProfile } from "@/lib/providers/unipile/http";
import { sourceEngagersFromOwnRecentPosts } from "@/lib/linkedin/post-sourcing";
import { connectedSeatsPerTenant } from "@/lib/linkedin/hydration-seat";

/**
 * Spec 36 (T11) — daily, auto-source the people engaging with each seat owner's
 * OWN recent posts as warm-lead contacts. The autonomous extension of #509: the
 * CRM fills with "who's engaging with my content" without anyone calling a route.
 *
 * OFF by default behind LINKEDIN_ENGAGEMENT_SOURCING_ENABLED (a deliberate ops
 * flip, like the other LinkedIn crons). Cheap — reactions/comments are LIST reads
 * (no per-engager profile views, so no view-budget needed). Bounded by
 * LINKEDIN_ENGAGEMENT_MAX_POSTS (default 5) × MAX_PER_POST (default 200) per seat.
 * Per-tenant fault isolation + onFailure dead-letter, mirroring the sibling crons.
 */
export const linkedinEngagementSourcingCron = inngest.createFunction(
  {
    id: "linkedin-engagement-sourcing",
    name: "Cron: LinkedIn engagement -> warm leads",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("linkedin-engagement-sourcing.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "TZ=UTC 0 6 * * *" }], // 06:00 UTC daily
  },
  async ({ step }) => {
    const flag = process.env.LINKEDIN_ENGAGEMENT_SOURCING_ENABLED;
    if (flag !== "true" && flag !== "1") return { enabled: false };
    const cfg = readUnipileConfig();
    if (!cfg) return { enabled: true, reason: "no_unipile_config" };

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

    const clamp = (v: unknown, def: number, hi: number) => Math.max(1, Math.min(hi, Math.floor(Number(v)) || def));
    const maxPosts = clamp(process.env.LINKEDIN_ENGAGEMENT_MAX_POSTS, 5, 20);
    const maxPerPost = clamp(process.env.LINKEDIN_ENGAGEMENT_MAX_PER_POST, 200, 500);
    const totals = { tenants: 0, postsScanned: 0, contactsUpserted: 0, skippedNoIdentity: 0, failedTenants: 0 };

    for (const [tenantId, unipileAccountId] of perTenant) {
      const r = await step.run(`source-${tenantId}`, async () => {
        try {
          const me = await getUnipileOwnProfile(cfg, unipileAccountId);
          if (!me.provider_id) return { postsScanned: 0, contactsUpserted: 0, skippedNoIdentity: 0, failed: false };
          const res = await sourceEngagersFromOwnRecentPosts(cfg, { tenantId, unipileAccountId }, me.provider_id, { maxPosts, maxPerPost });
          return { ...res, failed: false };
        } catch (err) {
          logger.warn("linkedin-engagement-sourcing.tenant_failed", {
            tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
          return { postsScanned: 0, contactsUpserted: 0, skippedNoIdentity: 0, failed: true };
        }
      });
      totals.tenants++;
      totals.postsScanned += r.postsScanned;
      totals.contactsUpserted += r.contactsUpserted;
      totals.skippedNoIdentity += r.skippedNoIdentity;
      if (r.failed) totals.failedTenants++;
    }

    logger.info("linkedin-engagement-sourcing.run_done", totals);
    return { enabled: true, ...totals };
  },
);
