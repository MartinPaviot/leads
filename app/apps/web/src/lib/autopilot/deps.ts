/**
 * Autopilot RunAutopilotDeps factory — the real (db-backed) wiring for
 * runAutopilotForTenant. Extracted from the daily cron so BOTH the unattended
 * daily loop (inngest/daily-autopilot.ts) AND on-demand runs (e.g. "run the
 * autopilot for this account list now", via the chat tool) build identical
 * deps. The ONLY knob is `opts.listId`, which narrows the candidate source to a
 * list's member companies — every other gate (targeting, exclusion,
 * eligibility, budget, capacity, approval-mode) is unchanged, so a list run is
 * a NARROWING of the daily run, never a bypass.
 *
 * Decoupled from inngest on purpose (no `inngest` import) so it's callable from
 * an API route / chat tool without pulling the cron registration.
 */
import { db } from "@/db";
import { sequences, sequenceEnrollments, companies } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import { coerceConfigBudget } from "@/lib/autopilot/budget";
import { loadTenantCapacity } from "@/lib/autopilot/capacity-source";
import { loadCandidates } from "@/lib/autopilot/candidates";
import { prepareProspect } from "@/lib/autopilot/prepare";
import { enrollOne } from "@/lib/autopilot/enroll";
import { runAutopilotForTenant, type RunAutopilotDeps, type TenantAutopilotSummary } from "@/lib/autopilot/run";
import { resolveSequenceForProspect, type RouterSequence } from "@/lib/autopilot/sequence-router";

/** Fallback if a tenant predates the `dailyAutopilotBudget` default (DEFAULTS sets 100). */
const DEFAULT_BUDGET = 100;

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

/**
 * Build the real (db-backed) autopilot deps for a run at `now`. `opts.listId`
 * narrows candidate loading to a list's members; everything else is identical
 * to the daily cron's wiring.
 */
export function buildAutopilotDeps(now: Date, opts?: { listId?: string }): RunAutopilotDeps {
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
    loadCandidates: (tenantId, limit) => loadCandidates(tenantId, limit, db, opts?.listId),
    prepare: (tenantId, contactId, companyId) => prepareProspect(tenantId, contactId, companyId),
    enroll: (input) => enrollOne(input),
  };
}

/**
 * On-demand: run the autopilot for a tenant scoped to ONE account list. Same
 * pipeline + gates as the daily cron (capacity, budget, targeting, eligibility,
 * approval-mode drafts-vs-auto, autopilotPaused) — only the candidate pool is
 * the list's members. Does NOT check DAILY_AUTOPILOT_ENABLED: that flag gates
 * the unattended cron, not an explicit user action.
 */
export function runAutopilotForList(tenantId: string, listId: string, now: Date): Promise<TenantAutopilotSummary> {
  return runAutopilotForTenant(tenantId, buildAutopilotDeps(now, { listId }));
}
