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
import { tenants, sequences, sequenceEnrollments } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import { coerceConfigBudget } from "@/lib/autopilot/budget";
import { loadTenantCapacity } from "@/lib/autopilot/capacity-source";
import { loadCandidates } from "@/lib/autopilot/candidates";
import { prepareProspect } from "@/lib/autopilot/prepare";
import { enrollOne } from "@/lib/autopilot/enroll";
import { runAutopilotForTenant, type RunAutopilotDeps, type TenantAutopilotSummary } from "@/lib/autopilot/run";

/** Fallback if a tenant predates the `dailyAutopilotBudget` default (DEFAULTS sets 100). */
const DEFAULT_BUDGET = 100;

export function isDailyAutopilotEnabled(): boolean {
  const v = process.env.DAILY_AUTOPILOT_ENABLED;
  return v === "1" || v === "true";
}

/** Autopilot/any enrollments created for a tenant since UTC midnight — the per-day spend. */
async function countEnrolledToday(tenantId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
    .where(and(eq(sequences.tenantId, tenantId), gte(sequenceEnrollments.enrolledAt, since)));
  return Number(row?.n ?? 0);
}

function realDeps(now: Date): RunAutopilotDeps {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return {
    loadCapacity: (tenantId) => loadTenantCapacity(tenantId),
    getConfig: async (tenantId) => {
      const s = await getTenantSettings(tenantId);
      // `dailyAutopilotBudget` is the per-tenant ceiling (DEFAULTS = 100; 0 pauses
      // this tenant). Coerced: non-finite/negative → the global default.
      const configBudget = coerceConfigBudget(s.dailyAutopilotBudget, DEFAULT_BUDGET);
      return { configBudget, maxEmailsPerDay: null, approvalMode: readApprovalMode(s) };
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
