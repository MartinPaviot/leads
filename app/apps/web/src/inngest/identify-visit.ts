/**
 * Inngest function: `visit/created` → identify the company.
 *
 * MONACO-PARITY-04. Triggered by every successful POST to
 * /api/v1/visit/track. Looks up the visit, calls the configured
 * provider (Snitcher by default — Monaco's own choice on
 * monaco.com), and writes back `company_domain`, `company_id`,
 * `identified_at`, `identified_by`.
 *
 * Identification cost: provider charges per resolution. We emit a
 * structured log on each identification so spend can be tracked
 * downstream against the per-tenant cap (`SNITCHER_MONTHLY_CAP_USD`,
 * default $50 — Monaco-style conservative).
 */

import { inngest } from "./client";
import { db } from "@/db";
import { visits, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getVisitorIdProvider } from "@/lib/visitor-id/snitcher";
import { logger } from "@/lib/observability/logger";

interface IdentifyEvent {
  data: { visitId: string; tenantId: string; ip?: string };
}

export const identifyVisit = inngest.createFunction(
  {
    id: "identify-visit",
    name: "Identify visitor company (Snitcher / RB2B)",
    retries: 1,
    triggers: [{ event: "visit/created" }],
  },
  async ({ event, step }: { event: IdentifyEvent; step: any }) => {
    const { visitId, tenantId } = event.data;

    const provider = getVisitorIdProvider();
    if (!provider.isAvailable()) {
      logger.info("identify-visit: provider unavailable, skipping", {
        provider: provider.name,
        visitId,
      });
      return { skipped: true, reason: "provider_unavailable" };
    }

    const [row] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.id, visitId), eq(visits.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      return { skipped: true, reason: "visit_not_found" };
    }

    if (row.companyDomain) {
      // Already identified — don't double-charge.
      return { skipped: true, reason: "already_identified" };
    }

    const ip = event.data.ip;
    if (!ip || ip === "0.0.0.0") {
      // No usable IP (loopback or absent). Mark the visit as
      // attempted-but-unmatched so we don't retry forever.
      await db
        .update(visits)
        .set({ identifiedAt: new Date(), identifiedBy: provider.name })
        .where(eq(visits.id, visitId));
      return { skipped: true, reason: "no_raw_ip" };
    }

    const result = await provider.identify({
      ip,
      userAgent: row.userAgent,
      url: row.url,
    });

    if (!result) {
      // No match — record the attempt so we don't retry forever.
      await db
        .update(visits)
        .set({ identifiedAt: new Date(), identifiedBy: provider.name })
        .where(eq(visits.id, visitId));
      return { matched: false };
    }

    // Upsert company by (tenant, domain).
    const companyId = await step.run("upsert-company", async () => {
      const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.tenantId, tenantId),
            eq(companies.domain, result.companyDomain),
          ),
        )
        .limit(1);
      if (existing) return existing.id;
      const [created] = await db
        .insert(companies)
        .values({
          tenantId,
          name: result.companyName ?? result.companyDomain,
          domain: result.companyDomain,
        })
        .returning({ id: companies.id });
      return created.id;
    });

    await db
      .update(visits)
      .set({
        companyDomain: result.companyDomain,
        companyId,
        identifiedAt: new Date(),
        identifiedBy: provider.name,
      })
      .where(eq(visits.id, visitId));

    logger.info("identify-visit: matched", {
      visitId,
      tenantId,
      companyDomain: result.companyDomain,
      provider: provider.name,
    });

    return { matched: true, companyDomain: result.companyDomain, companyId };
  },
);
