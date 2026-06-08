import { inngest } from "./client";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, isNotNull, or, lt, sql } from "drizzle-orm";
import { proposeTamChange } from "@/lib/tam/proposals";
import { DEFAULT_ENRICHMENT_TTL_DAYS } from "@/lib/enrichment/freshness";

/**
 * TAM staleness refresh (living-TAM loop). Daily, per tenant, finds the
 * stalest companies (never-enriched first, then past the TTL) and QUEUES
 * refresh proposals — it never re-enriches directly. Approving a proposal
 * is what authorises the credit spend (approval-queue posture).
 *
 * Bounded per tenant so a big TAM can't flood the queue or the budget in
 * one night; the rest surface on subsequent days as they remain stale.
 */
const PER_TENANT_BUDGET = 25;

export const tamRefreshDaily = inngest.createFunction(
  {
    id: "tam-refresh-daily",
    name: "TAM staleness refresh → proposals",
    triggers: [{ cron: "30 4 * * *" }],
  },
  async ({ step }: { step: any }) => {
    const cutoff = new Date(
      Date.now() - DEFAULT_ENRICHMENT_TTL_DAYS * 86_400_000,
    );

    const tenantIds: string[] = await step.run("list-tenants", async () => {
      const rows = await db
        .selectDistinct({ tenantId: companies.tenantId })
        .from(companies)
        .where(isNull(companies.deletedAt));
      return rows.map((r) => r.tenantId);
    });

    let proposed = 0;
    for (const tenantId of tenantIds) {
      proposed += await step.run(`refresh-${tenantId}`, async () => {
        const stale = await db
          .select({
            id: companies.id,
            name: companies.name,
            lastEnrichedAt: companies.lastEnrichedAt,
          })
          .from(companies)
          .where(
            and(
              eq(companies.tenantId, tenantId),
              isNull(companies.deletedAt),
              isNull(companies.excludedReason),
              isNotNull(companies.domain),
              or(
                isNull(companies.lastEnrichedAt),
                lt(companies.lastEnrichedAt, cutoff),
              ),
            ),
          )
          // Never-enriched (NULL) first, then oldest.
          .orderBy(sql`last_enriched_at asc nulls first`)
          .limit(PER_TENANT_BUDGET);

        let c = 0;
        for (const co of stale) {
          const r = await proposeTamChange({
            tenantId,
            kind: "refresh",
            entityType: "company",
            entityId: co.id,
            dedupKey: `company:${co.id}`,
            summary: `Refresh ${co.name}`,
            reason: co.lastEnrichedAt
              ? `Last enriched ${new Date(co.lastEnrichedAt).toISOString().slice(0, 10)}`
              : "Never enriched",
            source: "refresh_cron",
          });
          if (r.created) c++;
        }
        return c;
      });
    }

    return { tenants: tenantIds.length, proposed };
  },
);
