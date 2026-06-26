/**
 * Spec 37 (B4.2) — the daily-autopilot cron. Thin Inngest wrapper: flag-gate,
 * fetch tenants, run the per-tenant orchestration (lib/autopilot/run.ts) under a
 * per-tenant step.run so one tenant's failure can't starve the rest. Mirrors the
 * signalScoreDaily shape (concurrency 1, dead-letter log). Behind
 * DAILY_AUTOPILOT_ENABLED (default OFF) — with it off this is a no-op.
 *
 * Composition only: every real dep is an existing module; nothing here bypasses a
 * guardrail (each enrolled step still passes evaluateSend at transport).
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants, sequences, sequenceEnrollments, companies } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import { coerceConfigBudget } from "@/lib/autopilot/budget";
import { isDailyAutopilotEnabled } from "@/lib/autopilot/flag";
import { loadTenantCapacity } from "@/lib/autopilot/capacity-source";
import { loadCandidates } from "@/lib/autopilot/candidates";
import { prepareProspect } from "@/lib/autopilot/prepare";
import { enrollOne } from "@/lib/autopilot/enroll";
import { runAutopilotForTenant, type RunAutopilotDeps, type TenantAutopilotSummary } from "@/lib/autopilot/run";
import { resolveSequenceForProspect, type RouterSequence } from "@/lib/autopilot/sequence-router";

/** Fallback if a tenant predates the `dailyAutopilotBudget` default (DEFAULTS sets 100). */
const DEFAULT_BUDGET = 100;

// Re-exported so existing importers keep their path; the impl now lives in the pure
// flag module (lib/autopilot/flag.ts) so it can be unit-tested without @/db.
export { isDailyAutopilotEnabled };

/** Autopilot/any enrollments created for a tenant since UTC midnight — the per-day spend. */
async function countEnrolledToday(tenantId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
    .where(and(eq(sequences.tenantId, tenantId), gte(sequenceEnrollments.enrolledAt, since)));
  return Number(row?.n ?? 0);
}

/** A tenant's active sequences for the router (most-recent first). */
async function loadActiveSequencesForRouting(tenantId: string): Promise<RouterSequence[]> {
  const rows = await db
    .select({ id: sequences.id, name: sequences.name, icpId: sequences.icpId, campaignConfig: sequences.campaignConfig })
    .from(sequences)
    .where(and(eq(sequences.tenantId, tenantId), eq(sequences.status, "active")))
    .orderBy(desc(sequences.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icpId: r.icpId ?? null,
    campaignConfig: (r.campaignConfig as Record<string, unknown> | null) ?? null,
  }));
}

/** The company's primary ICP + freshest signal type (the "why-now") for sequence routing. */
async function loadCompanyRouting(tenantId: string, companyId: string): Promise<{ primaryIcpId: string | null; topSignalType: string | null }> {
  const [row] = await db
    .select({ properties: companies.properties })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)))
    .limit(1);
  const props = (row?.properties as Record<string, unknown> | null) ?? {};
  const primaryIcpId = typeof props.primaryIcpId === "string" ? props.primaryIcpId : null;
  const signals = Array.isArray(props.signals) ? (props.signals as Array<{ type?: unknown; detectedAt?: unknown }>) : [];
  const freshest = signals
    .filter((s) => typeof s.type === "string")
    .sort((a, b) => String(b.detectedAt ?? "").localeCompare(String(a.detectedAt ?? "")))[0];
  return { primaryIcpId, topSignalType: freshest && typeof freshest.type === "string" ? freshest.type : null };
}

function realDeps(now: Date): RunAutopilotDeps {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  // Per-run cache: the active-sequence set is the same for all of a tenant's prospects.
  const seqCache = new Map<string, Promise<RouterSequence[]>>();
  const loadActiveSequences = (tenantId: string) => {
    let p = seqCache.get(tenantId);
    if (!p) { p = loadActiveSequencesForRouting(tenantId); seqCache.set(tenantId, p); }
    return p;
  };
  return {
    loadCapacity: (tenantId) => loadTenantCapacity(tenantId),
    getConfig: async (tenantId) => {
      const s = await getTenantSettings(tenantId);
      // `dailyAutopilotBudget` is the per-tenant ceiling (DEFAULTS = 100; 0 pauses
      // this tenant). Coerced: non-finite/negative → the global default.
      const configBudget = coerceConfigBudget(s.dailyAutopilotBudget, DEFAULT_BUDGET);
      return { configBudget, maxEmailsPerDay: null, approvalMode: readApprovalMode(s), autopilotPaused: s.autopilotPaused ?? false };
    },
    spentToday: (tenantId) => countEnrolledToday(tenantId, startOfDay),
    getActiveSequenceId: async (tenantId) => {
      const [seq] = await db
        .select({ id: sequences.id })
        .from(sequences)
        .where(and(eq(sequences.tenantId, tenantId), eq(sequences.status, "active")))
        .limit(1);
      return seq?.id ?? null;
    },
    // Per-prospect sequence routing (the active sequence whose ICP/trigger matches the
    // prospect's company+signal) — falls back to the active sequence inside run.ts.
    resolveSequenceId: (tenantId, companyId) =>
      resolveSequenceForProspect(tenantId, companyId, { loadActiveSequences, loadCompanyRouting }),
    loadCandidates: (tenantId, limit) => loadCandidates(tenantId, limit),
    prepare: (tenantId, contactId, companyId) => prepareProspect(tenantId, contactId, companyId),
    enroll: (input) => enrollOne(input),
  };
}

export const dailyAutopilot = inngest.createFunction(
  {
    id: "daily-autopilot",
    name: "Cron: daily autopilot (signal-ranked enroll)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("daily-autopilot.dead_letter", { err: error instanceof Error ? error.message : String(error) });
    },
    triggers: [{ cron: "0 7 * * 1-5" }], // weekday mornings, 07:00 UTC
  },
  async ({ step }: { step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> } }) => {
    if (!isDailyAutopilotEnabled()) return { enabled: false, tenants: 0 };

    const now = new Date();
    const deps = realDeps(now);
    const allTenants = await step.run("fetch-tenants", async () => db.select({ id: tenants.id }).from(tenants));

    const perTenant: TenantAutopilotSummary[] = [];
    for (const t of allTenants) {
      const summary = await step.run(`autopilot-${t.id}`, async () => {
        try {
          const s = await runAutopilotForTenant(t.id, deps);
          // B6.1 telemetry — the per-run cost signal. `prepared` is the LLM-call
          // lower bound and is structurally ≤ `budget`; alert if that ever inverts.
          logger.info("daily-autopilot.tenant_done", {
            tenantId: t.id, budget: s.budget, selected: s.selected,
            prepared: s.prepared, enrolled: s.enrolled, drafted: s.drafted,
            errors: s.errors, skipped: s.skipped ?? null,
            overBudget: s.prepared > s.budget,
          });
          return s;
        } catch (err) {
          logger.warn("daily-autopilot.tenant_failed", { tenantId: t.id, err: err instanceof Error ? err.message : String(err) });
          return { tenantId: t.id, budget: 0, selected: 0, prepared: 0, enrolled: 0, drafted: 0, errors: 1 } as TenantAutopilotSummary;
        }
      });
      perTenant.push(summary);
    }

    const totals = perTenant.reduce(
      (acc, s) => ({ prepared: acc.prepared + s.prepared, enrolled: acc.enrolled + s.enrolled, drafted: acc.drafted + s.drafted, errors: acc.errors + s.errors }),
      { prepared: 0, enrolled: 0, drafted: 0, errors: 0 },
    );
    logger.info("daily-autopilot.run_done", { tenants: allTenants.length, ...totals });
    return { enabled: true, tenants: allTenants.length, ...totals, perTenant };
  },
);
