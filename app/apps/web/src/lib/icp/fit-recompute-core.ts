/**
 * ICP fit recompute core (Phase 0, _specs/icp-unification R1/R3).
 *
 * The orchestration-free primitives shared by the Inngest function
 * (one step per batch → a timeout can no longer leave a tenant
 * half-written, batches are memoized on retry) and the ops backfill
 * script (runs them sequentially, no Inngest dependency).
 *
 * Per batch of companies this does exactly three queries:
 *   1. SELECT the batch rows,
 *   2. one multi-row INSERT … ON CONFLICT for all fit cells,
 *   3. one UPDATE … FROM jsonb_to_recordset for score + primaryIcpId
 * instead of the previous await-per-cell loop (~3k round-trips for the
 * Pilae tenant — the reason the old recompute died midway).
 *
 * Scale contract (R1): company_icp_fit.fit_score stays [0,1] (the
 * blended score01); the companies.score mirror is round(100 × primary)
 * — every existing 0-100 reader (GRADE_RANGES, displayScore,
 * calls/campaign) is honest again.
 */

import { db } from "@/db";
import { companies, icps, icpCriteria, companyIcpFit } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  computeBlendedFit,
  resolvePrimaryIcp,
  type Criterion,
  type IcpFitCell,
} from "./criteria-engine";
import { SOURCING_ONLY_FIELD_KEYS } from "./field-catalog";
import { buildCompanyContext } from "./company-context";
import { getGrade } from "@/lib/scoring/scoring";
import { updateTenantSettings } from "@/lib/config/tenant-settings";

export const RECOMPUTE_BATCH_SIZE = 100;
export const PRIMARY_FIT_THRESHOLD = 0.5;

export type ActiveIcp = {
  id: string;
  priority: number;
  criteria: Criterion[];
};

export type BatchDiff = {
  companies: number;
  regradedUp: number;
  regradedDown: number;
  unowned: number;
};

export type RecomputeSummary = BatchDiff & {
  at: string;
  icps: number;
};

/** Active, non-deleted ICPs with their criteria (one query each way). */
export async function loadActiveIcps(tenantId: string): Promise<ActiveIcp[]> {
  const rows = await db
    .select({ id: icps.id, priority: icps.priority })
    .from(icps)
    .where(and(eq(icps.tenantId, tenantId), eq(icps.status, "active"), isNull(icps.deletedAt)));
  if (rows.length === 0) return [];

  const criteriaRows = await db
    .select()
    .from(icpCriteria)
    .where(inArray(icpCriteria.icpId, rows.map((r) => r.id)));

  const byIcp = new Map<string, Criterion[]>();
  for (const r of criteriaRows) {
    const list = byIcp.get(r.icpId) ?? [];
    list.push({
      id: r.id,
      fieldKey: r.fieldKey,
      operator: r.operator as Criterion["operator"],
      value: r.value,
      weight: r.weight,
      isRequired: r.isRequired,
    });
    byIcp.set(r.icpId, list);
  }
  return rows.map((r) => ({ id: r.id, priority: r.priority, criteria: byIcp.get(r.id) ?? [] }));
}

/**
 * Guard (R3.4, tightened): only recompute when at least one active ICP
 * has a criterion the company engine can actually score. Empty shells
 * (the 96 migration "Default"s) and people-only ICPs must not zero a
 * tenant's legacy scores.
 */
export function hasScorableCriteria(activeIcps: ActiveIcp[]): boolean {
  return activeIcps.some((icp) =>
    icp.criteria.some((c) => !SOURCING_ONLY_FIELD_KEYS.has(c.fieldKey)),
  );
}

/** Stable id list for batch slicing — concurrent inserts are caught next run. */
export async function listCompanyIds(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
    .orderBy(companies.id);
  return rows.map((r) => r.id);
}

/** "Not scored" sorts below every grade; used for the regrade diff. */
const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"];
export function gradeRank(score: number | null): number {
  if (score === null) return -1;
  return GRADE_ORDER.indexOf(getGrade(score).grade);
}

/**
 * Score one batch of companies against every active ICP. Upserts the
 * fit cells, mirrors the primary fit into companies.score (0-100) +
 * properties.primaryIcpId, and returns the grade-movement diff vs the
 * scores the rows had before this run.
 */
export async function scoreCompanyBatch(
  tenantId: string,
  companyIds: string[],
  activeIcps: ActiveIcp[],
): Promise<BatchDiff> {
  if (companyIds.length === 0 || activeIcps.length === 0) {
    return { companies: 0, regradedUp: 0, regradedDown: 0, unowned: 0 };
  }

  const rows = await db
    .select({
      id: companies.id,
      industry: companies.industry,
      size: companies.size,
      revenue: companies.revenue,
      properties: companies.properties,
      score: companies.score,
    })
    .from(companies)
    .where(
      and(
        eq(companies.tenantId, tenantId),
        inArray(companies.id, companyIds),
        isNull(companies.deletedAt),
      ),
    );

  const now = new Date();
  const cellRows: Array<typeof companyIcpFit.$inferInsert> = [];
  const updates: Array<{ id: string; score: number; primary_icp_id: string | null }> = [];
  let regradedUp = 0;
  let regradedDown = 0;
  let unowned = 0;

  for (const company of rows) {
    const ctx = buildCompanyContext({
      industry: company.industry,
      size: company.size,
      revenue: company.revenue,
      properties: company.properties as Record<string, unknown> | null,
    });

    const cells: IcpFitCell[] = [];
    for (const icp of activeIcps) {
      const fit = computeBlendedFit(icp.criteria, ctx);
      cells.push({ icpId: icp.id, priority: icp.priority, fitScore: fit.score01 });
      cellRows.push({
        companyId: company.id,
        icpId: icp.id,
        tenantId,
        fitScore: fit.score01,
        matchedCriteria: {
          matched: fit.matched,
          unmatched: fit.unmatched,
          excludedBy: fit.excludedBy,
          identityFit: fit.identityFit,
          signalFit: fit.signalFit,
          coverage: fit.coverage,
        },
        computedAt: now,
      });
    }

    const primary = resolvePrimaryIcp(cells, PRIMARY_FIT_THRESHOLD);
    const newScore = primary ? Math.round(100 * primary.fitScore) : 0;
    if (!primary) unowned++;
    const before = gradeRank(company.score);
    const after = gradeRank(newScore);
    if (after > before) regradedUp++;
    else if (after < before) regradedDown++;
    updates.push({ id: company.id, score: newScore, primary_icp_id: primary?.icpId ?? null });
  }

  if (cellRows.length > 0) {
    await db
      .insert(companyIcpFit)
      .values(cellRows)
      .onConflictDoUpdate({
        target: [companyIcpFit.companyId, companyIcpFit.icpId],
        set: {
          fitScore: sql`excluded.fit_score`,
          matchedCriteria: sql`excluded.matched_criteria`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }

  if (updates.length > 0) {
    // One statement for the whole batch. jsonb_build_object('primaryIcpId',
    // NULL) yields a JSON null, which ->> reads back as SQL NULL — the
    // exact "unowned" shape resolvePrimaryIcp consumers expect.
    await db.execute(sql`
      UPDATE companies AS c SET
        score = v.score::real,
        properties = COALESCE(c.properties, '{}'::jsonb)
          || jsonb_build_object('primaryIcpId', v.primary_icp_id),
        updated_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        AS v(id text, score int, primary_icp_id text)
      WHERE c.id = v.id AND c.tenant_id = ${tenantId}
    `);
  }

  return { companies: rows.length, regradedUp, regradedDown, unowned };
}

/** Persist the run summary for the editor's diff-after-save poll (R3.3). */
export async function writeRecomputeSummary(
  tenantId: string,
  summary: RecomputeSummary,
): Promise<void> {
  await updateTenantSettings(tenantId, { lastIcpRecompute: summary });
}

/**
 * Sequential full recompute — the script / synchronous path. The
 * Inngest function runs the same primitives with one durable step per
 * batch instead. Returns null when the guard says "nothing scorable".
 */
export async function runFullRecompute(tenantId: string): Promise<RecomputeSummary | null> {
  const activeIcps = await loadActiveIcps(tenantId);
  if (!hasScorableCriteria(activeIcps)) return null;

  const ids = await listCompanyIds(tenantId);
  const agg: BatchDiff = { companies: 0, regradedUp: 0, regradedDown: 0, unowned: 0 };
  for (let i = 0; i < ids.length; i += RECOMPUTE_BATCH_SIZE) {
    const diff = await scoreCompanyBatch(
      tenantId,
      ids.slice(i, i + RECOMPUTE_BATCH_SIZE),
      activeIcps,
    );
    agg.companies += diff.companies;
    agg.regradedUp += diff.regradedUp;
    agg.regradedDown += diff.regradedDown;
    agg.unowned += diff.unowned;
  }

  const summary: RecomputeSummary = {
    ...agg,
    at: new Date().toISOString(),
    icps: activeIcps.length,
  };
  await writeRecomputeSummary(tenantId, summary);
  return summary;
}
