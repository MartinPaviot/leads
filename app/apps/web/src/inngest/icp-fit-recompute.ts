/**
 * ICP fit recompute (P1b, _specs/multi-icp). Populates the
 * company_icp_fit matrix and mirrors the primary-ICP fit into the
 * legacy companies.score scalar so every existing read keeps working.
 *
 * Two triggers:
 *   - event `icp/recompute-tenant` { tenantId } — full recompute for
 *     one tenant (fired after an ICP is created/edited, or the
 *     retro-compat migration).
 *   - cron daily 05:00 UTC — safety-net full recompute across tenants.
 *
 * The math is pure (lib/icp/criteria-engine + company-context); this
 * fn is the I/O orchestrator. For each active ICP's criteria and each
 * company in the tenant, it computes a fit cell, upserts it, then
 * resolves the primary ICP per company and writes that fit to
 * companies.score (+ records the primary icp id in properties).
 *
 * Incremental recompute on fresh signals is a Phase 2+ refinement;
 * Phase 1b does a bounded full pass (batched) which is correct and
 * good enough at current tenant sizes.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { companies, icps, icpCriteria, companyIcpFit } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  computeIcpFit,
  resolvePrimaryIcp,
  type Criterion,
  type IcpFitCell,
} from "@/lib/icp/criteria-engine";
import { buildCompanyContext } from "@/lib/icp/company-context";
import { logger } from "@/lib/observability/logger";

const PRIMARY_FIT_THRESHOLD = 0.5;

export async function recomputeTenant(tenantId: string): Promise<{
  companies: number;
  icps: number;
  cells: number;
}> {
  // 1. Active ICPs + their criteria.
  const activeIcps = await db
    .select({ id: icps.id, priority: icps.priority })
    .from(icps)
    .where(and(eq(icps.tenantId, tenantId), eq(icps.status, "active"), isNull(icps.deletedAt)));

  if (activeIcps.length === 0) {
    return { companies: 0, icps: 0, cells: 0 };
  }

  const criteriaByIcp = new Map<string, Criterion[]>();
  for (const icp of activeIcps) {
    const rows = await db
      .select()
      .from(icpCriteria)
      .where(eq(icpCriteria.icpId, icp.id));
    criteriaByIcp.set(
      icp.id,
      rows.map((r) => ({
        id: r.id,
        fieldKey: r.fieldKey,
        operator: r.operator as Criterion["operator"],
        value: r.value,
        weight: r.weight,
        isRequired: r.isRequired,
      })),
    );
  }

  // Non-destructive guard: if NO active ICP has any criteria (e.g. a
  // freshly auto-created empty "Default" ICP from the retro-compat
  // migration), do NOT touch the matrix or companies.score. Every
  // empty ICP would score fit=0, which would null out the legacy
  // score that the old system populated. We only let the matrix drive
  // companies.score once there are real criteria to evaluate.
  const hasAnyCriteria = activeIcps.some(
    (icp) => (criteriaByIcp.get(icp.id) ?? []).length > 0,
  );
  if (!hasAnyCriteria) {
    return { companies: 0, icps: activeIcps.length, cells: 0 };
  }

  // 2. Companies (batch). Excludes soft-deleted.
  const rows = await db
    .select({
      id: companies.id,
      industry: companies.industry,
      size: companies.size,
      revenue: companies.revenue,
      properties: companies.properties,
    })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));

  let cellCount = 0;
  const now = new Date();

  for (const company of rows) {
    const ctx = buildCompanyContext({
      industry: company.industry,
      size: company.size,
      revenue: company.revenue,
      properties: company.properties as Record<string, unknown> | null,
    });

    const cells: IcpFitCell[] = [];
    for (const icp of activeIcps) {
      const criteria = criteriaByIcp.get(icp.id) ?? [];
      const fit = computeIcpFit(criteria, ctx);
      cells.push({ icpId: icp.id, priority: icp.priority, fitScore: fit.fitScore });

      // Upsert the matrix cell.
      await db
        .insert(companyIcpFit)
        .values({
          companyId: company.id,
          icpId: icp.id,
          tenantId,
          fitScore: fit.fitScore,
          matchedCriteria: {
            matched: fit.matched,
            unmatched: fit.unmatched,
            excludedBy: fit.excludedBy,
          },
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [companyIcpFit.companyId, companyIcpFit.icpId],
          set: {
            fitScore: fit.fitScore,
            matchedCriteria: {
              matched: fit.matched,
              unmatched: fit.unmatched,
              excludedBy: fit.excludedBy,
            },
            computedAt: now,
          },
        });
      cellCount++;
    }

    // 3. Mirror the primary-ICP fit into the legacy scalar so every
    //    existing read (contact scorer, dashboards) keeps working.
    const primary = resolvePrimaryIcp(cells, PRIMARY_FIT_THRESHOLD);
    const existingProps =
      (company.properties as Record<string, unknown> | null) ?? {};
    await db
      .update(companies)
      .set({
        score: primary ? primary.fitScore : 0,
        properties: {
          ...existingProps,
          primaryIcpId: primary?.icpId ?? null,
        },
        updatedAt: now,
      })
      .where(eq(companies.id, company.id));
  }

  return { companies: rows.length, icps: activeIcps.length, cells: cellCount };
}

export const icpFitRecomputeTenant = inngest.createFunction(
  {
    id: "icp-fit-recompute-tenant",
    name: "ICP fit recompute (single tenant)",
    retries: 1,
    triggers: [{ event: "icp/recompute-tenant" }],
  },
  async ({ event, step }: { event: { data: { tenantId: string } }; step: any }) => {
    const { tenantId } = event.data;
    const result = await step.run("recompute", async () =>
      recomputeTenant(tenantId),
    );
    logger.info("icp-fit-recompute.tenant", { tenantId, ...result });
    return result;
  },
);

export const icpFitRecomputeDaily = inngest.createFunction(
  {
    id: "icp-fit-recompute-daily",
    name: "Cron: ICP fit recompute (all tenants)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "0 5 * * *" }],
  },
  async ({ step }: { step: any }) => {
    const tenants = await step.run("fetch-tenants", async () =>
      db.select({ id: icps.tenantId }).from(icps).where(isNull(icps.deletedAt)).groupBy(icps.tenantId),
    );
    let total = 0;
    for (const t of tenants) {
      const r = await step.run(`recompute-${t.id}`, async () =>
        recomputeTenant(t.id),
      );
      total += r.cells;
    }
    return { tenants: tenants.length, totalCells: total };
  },
);
