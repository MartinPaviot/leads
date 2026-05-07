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
import { visits, companies, tenants } from "@/db/schema";
import { eq, and, gte, isNotNull, sql } from "drizzle-orm";
import { getVisitorIdProvider } from "@/lib/visitor-id/snitcher";
import { logger } from "@/lib/observability/logger";
import {
  loadSpendDecision,
  startOfUtcMonth,
} from "@/lib/visitor-id/spend-cap";
import {
  checkDedup,
  hashSubnet,
  type DedupCandidate,
  type PriorIdentification,
} from "@/lib/visitor-id/dedup";
import { desc } from "drizzle-orm";
import { planFanout } from "@/lib/visitor-id/fanout";

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

    // P0-2 task 2.1 — per-tenant monthly spend cap. Stop calling
    // the provider once the tenant's identifications this month
    // would push spend past their cap (default $50). The visit
    // row is left unmatched ; next month's reset re-enables it.
    const spendDecision = await step.run("check-spend-cap", () =>
      loadSpendDecision({
        tenantId,
        deps: {
          countIdentificationsThisMonth: async (tid, now) => {
            const since = startOfUtcMonth(now);
            const [{ c }] = await db
              .select({ c: sql<number>`count(*)::int` })
              .from(visits)
              .where(
                and(
                  eq(visits.tenantId, tid),
                  isNotNull(visits.identifiedAt),
                  isNotNull(visits.companyDomain),
                  gte(visits.identifiedAt, since),
                ),
              );
            return c;
          },
          loadTenantSettings: async (tid) => {
            const [t] = await db
              .select({ settings: tenants.settings })
              .from(tenants)
              .where(eq(tenants.id, tid))
              .limit(1);
            return (t?.settings as Record<string, unknown> | null) ?? null;
          },
        },
      }),
    );
    if (spendDecision.reached) {
      logger.warn("identify-visit: monthly cap reached, skipping", {
        tenantId,
        spendUsd: spendDecision.spendUsd,
        capUsd: spendDecision.capUsd,
      });
      return {
        skipped: true,
        reason: "cap_reached",
        spendUsd: spendDecision.spendUsd,
        capUsd: spendDecision.capUsd,
      };
    }
    if (spendDecision.warning) {
      // Surface the near-cap signal so the dashboard can render the
      // warning banner ; we still proceed with the identification.
      logger.info("identify-visit: spend approaching cap", {
        tenantId,
        spendUsd: spendDecision.spendUsd,
        capUsd: spendDecision.capUsd,
        remainingUsd: spendDecision.remainingUsd,
      });
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

    // P0-2 task 2.2 — dedup against recent identifications. Re-using
    // a prior result for the same IP / /24 subnet within the
    // tenant's window saves a paid lookup AND keeps the latency low.
    const candidate: DedupCandidate = {
      ipHash: row.ipHash,
      subnetHash: hashSubnet(ip),
    };
    const dedup = await step.run("check-dedup", () =>
      checkDedup({
        tenantId,
        candidate,
        deps: {
          findRecentIdentification: async ({ tenantId: tid, candidate: cand, cutoff }) => {
            // The schema currently stores ipHash on `visits` ; subnet
            // hashing is opt-in via a follow-up migration. Until then
            // the ipHash exact-match is the active dedup path. The
            // `cand.subnetHash` branch will plug in once the column
            // ships without changing this signature.
            const [hit] = await db
              .select({
                companyDomain: visits.companyDomain,
                companyId: visits.companyId,
                identifiedAt: visits.identifiedAt,
              })
              .from(visits)
              .where(
                and(
                  eq(visits.tenantId, tid),
                  isNotNull(visits.companyDomain),
                  gte(visits.identifiedAt, cutoff),
                  eq(visits.ipHash, cand.ipHash),
                ),
              )
              .orderBy(desc(visits.identifiedAt))
              .limit(1);
            if (!hit?.companyDomain || !hit.identifiedAt) return null;
            const prior: PriorIdentification = {
              companyDomain: hit.companyDomain,
              companyId: hit.companyId ?? "",
              identifiedAt: hit.identifiedAt,
              matchedBy: "ip_hash",
            };
            return prior;
          },
          loadTenantSettings: async (tid) => {
            const [t] = await db
              .select({ settings: tenants.settings })
              .from(tenants)
              .where(eq(tenants.id, tid))
              .limit(1);
            return (t?.settings as Record<string, unknown> | null) ?? null;
          },
        },
      }),
    );
    if (dedup.cached) {
      await db
        .update(visits)
        .set({
          companyDomain: dedup.cached.companyDomain,
          companyId: dedup.cached.companyId || null,
          identifiedAt: new Date(),
          identifiedBy: `${provider.name}_cached`,
        })
        .where(eq(visits.id, visitId));
      logger.info("identify-visit: dedup cache hit", {
        visitId,
        tenantId,
        companyDomain: dedup.cached.companyDomain,
        windowDays: dedup.windowDays,
      });
      return {
        matched: true,
        cached: true,
        companyDomain: dedup.cached.companyDomain,
        companyId: dedup.cached.companyId,
      };
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

    // Upsert company by (tenant, domain). Returns companyId AND
    // isNewCompany so the fan-out step knows whether to fire
    // `company/created` (which kicks off enrichment).
    const upsertResult = await step.run("upsert-company", async () => {
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
      if (existing) {
        return { companyId: existing.id, isNew: false };
      }
      const [created] = await db
        .insert(companies)
        .values({
          tenantId,
          name: result.companyName ?? result.companyDomain,
          domain: result.companyDomain,
        })
        .returning({ id: companies.id });
      return { companyId: created.id, isNew: true };
    });
    const companyId = upsertResult.companyId;

    await db
      .update(visits)
      .set({
        companyDomain: result.companyDomain,
        companyId,
        identifiedAt: new Date(),
        identifiedBy: provider.name,
      })
      .where(eq(visits.id, visitId));

    // P0-2 task 2.3 — fan-out events. Pure planner decides which
    // events to emit ; we dispatch via inngest.send. company/created
    // kicks the existing enrich pipeline ; signals/auto-enroll feeds
    // the existing signal-to-sequence worker which decides whether
    // to actually enroll contacts.
    const events = planFanout({
      tenantId,
      companyId,
      companyDomain: result.companyDomain,
      companyName: result.companyName,
      visitId,
      isNewCompany: upsertResult.isNew,
      fromCache: false,
      url: row.url,
    });
    if (events.length > 0) {
      try {
        await inngest.send(
          events.map((e) => ({
            name: e.name,
            data: e.data,
          })),
        );
      } catch (err) {
        // Fan-out is best-effort — the visit identification has
        // already landed. Worst case the founder doesn't see the
        // auto-enrollment ; the enrichment cron sweeps later.
        logger.warn("identify-visit: fanout dispatch failed (non-blocking)", {
          visitId,
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("identify-visit: matched", {
      visitId,
      tenantId,
      companyDomain: result.companyDomain,
      provider: provider.name,
    });

    return { matched: true, companyDomain: result.companyDomain, companyId };
  },
);
