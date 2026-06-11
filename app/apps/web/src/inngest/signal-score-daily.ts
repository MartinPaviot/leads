/**
 * Daily cron — recompute companies.priority_score (B3b, _specs/pilae-machine R4.2).
 *
 * For each tenant, walk every eligible company (not anti-ICP excluded,
 * not soft-deleted) and recompute the priority score using the
 * pure helpers in `lib/scoring/priority-score.ts`:
 *
 *   priority_score = bestSignalMultiplier × fitScore × accessibility
 *
 * Where:
 *   bestSignalMultiplier — max over the fired signals on the company,
 *     looked up via `getSignalMultipliers(tenantId)` from the outcome-
 *     attribution table. Defaults to 1.0× when the company has no
 *     fired signals (neutral — no scoring penalty for absence).
 *   fitScore             — `companies.score`, the existing ICP fit.
 *     NULL falls through to NEUTRAL_FIT_SCORE in the helper.
 *   accessibility        — max reachability across the company's
 *     contacts (email + phone + linkedin weighted), `computeAccessibility`.
 *
 * Persists `priority_score` and `priority_score_computed_at` so the
 * call queue and dashboard can sort by it cheaply.
 *
 * Cron: 06:00 UTC daily, single-flight. Batched per tenant via
 * `step.run` so a slow tenant doesn't block the others' retries.
 *
 * Why "max" over signals and not product: a company with two strong
 * signals isn't necessarily 2× more interesting than a company with
 * one; the strongest signal is the kairos point. Multiplying would
 * also exceed the [0.5, 2.5] band the per-signal multiplier is clamped
 * to, breaking the priority_score ~[0, 2.5] range assumption.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts, tenants } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  computeAccessibility,
  computePriorityScore,
  fitFromCompanyScore,
} from "@/lib/scoring/priority-score";
import { getSignalMultipliers } from "@/lib/scoring/signal-outcomes";
import { logger } from "@/lib/observability/logger";

type CompanyRow = {
  id: string;
  score: number | null;
  properties: unknown;
};

type ContactRow = {
  companyId: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
};

/**
 * Pure: pick the best (highest, never below 1.0 neutral) multiplier
 * for a company given its `properties.signals` and the tenant's
 * lookup table. Exported for unit tests; called only from the cron
 * loop in this file.
 *
 * Floor at 1.0 is deliberate: a sub-baseline signal (lift < 1×)
 * shouldn't penalise a company below neutral — the worst case is
 * "as good as having no signal at all". Penalising for the act of
 * having a signal would create perverse incentives in the scoring.
 */
export function bestMultiplierForCompany(
  properties: unknown,
  multipliers: Record<string, number>,
): number {
  const props = (properties as Record<string, unknown> | null) ?? {};
  const signals = Array.isArray(props.signals)
    ? (props.signals as Array<{ type?: unknown }>)
    : [];
  if (signals.length === 0) return 1;
  let best = 1;
  for (const s of signals) {
    if (typeof s?.type !== "string") continue;
    const mult = multipliers[s.type];
    if (typeof mult === "number" && mult > best) best = mult;
  }
  return best;
}

export const signalScoreDaily = inngest.createFunction(
  {
    id: "signal-score-daily",
    name: "Cron: priority_score recompute (daily)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }) => {
      logger.error("signal-score-daily.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }: {
    step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> };
  }) => {
    const now = new Date();

    const allTenants = await step.run("fetch-tenants", async () =>
      db.select({ id: tenants.id }).from(tenants),
    );

    let totalScored = 0;
    const perTenant: Array<{
      tenantId: string;
      scored: number;
      skipped: number;
    }> = [];

    for (const t of allTenants) {
      const result = await step.run(`score-${t.id}`, async () => {
        // 1. Tenant-level multiplier table (read once per tenant).
        let multipliers: Record<string, number> = {};
        try {
          const sm = await getSignalMultipliers(t.id);
          multipliers = sm.multipliers;
        } catch (err) {
          logger.warn("signal-score-daily.multipliers_lookup_failed", {
            tenantId: t.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }

        // 2. Eligible companies (not anti-ICP excluded, not soft-deleted).
        const rows: CompanyRow[] = await db
          .select({
            id: companies.id,
            score: companies.score,
            properties: companies.properties,
          })
          .from(companies)
          .where(
            and(
              eq(companies.tenantId, t.id),
              isNull(companies.excludedReason),
              isNull(companies.deletedAt),
            ),
          );

        if (rows.length === 0) {
          return { scored: 0, skipped: 0 };
        }

        // 3. Contacts grouped by companyId — one query, group in memory.
        const contactRows: ContactRow[] = await db
          .select({
            companyId: contacts.companyId,
            email: contacts.email,
            phone: contacts.phone,
            linkedinUrl: contacts.linkedinUrl,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, t.id),
              isNull(contacts.deletedAt),
            ),
          );

        const byCompany = new Map<string, ContactRow[]>();
        for (const c of contactRows) {
          if (!c.companyId) continue;
          const list = byCompany.get(c.companyId) ?? [];
          list.push(c);
          byCompany.set(c.companyId, list);
        }

        // 4. Compute + persist per company. We batch updates via a
        //    CASE expression so the whole tenant flushes in one
        //    statement instead of N round-trips.
        let scored = 0;
        let skipped = 0;
        const updates: Array<{ id: string; score: number }> = [];

        for (const company of rows) {
          const cs = byCompany.get(company.id) ?? [];
          const accessibility = computeAccessibility(
            cs.map((c) => ({
              hasEmail: !!c.email,
              hasPhone: !!c.phone,
              hasLinkedin: !!c.linkedinUrl,
            })),
          );
          const signalMultiplier = bestMultiplierForCompany(
            company.properties,
            multipliers,
          );
          const score = computePriorityScore({
            signalMultiplier,
            // companies.score is 0-100 since Phase 0 — the formula
            // wants the 0-1 fit (keeps priority in its ~[0, 2.5] band).
            fitScore: fitFromCompanyScore(company.score),
            accessibility,
          });
          // Skip rows where the score is 0 AND there's nothing to
          // refresh (no contacts, no signals). Avoids churning
          // updated_at on inert TAM ballast.
          if (
            score === 0 &&
            cs.length === 0 &&
            signalMultiplier === 1
          ) {
            skipped++;
            continue;
          }
          updates.push({ id: company.id, score });
        }

        if (updates.length > 0) {
          // Flush in chunks of 500 so the CASE WHEN expression stays
          // reasonable for Postgres' parser.
          const chunkSize = 500;
          for (let i = 0; i < updates.length; i += chunkSize) {
            const chunk = updates.slice(i, i + chunkSize);
            const ids = chunk.map((u) => u.id);
            const cases = sql.join(
              chunk.map(
                (u) =>
                  sql`WHEN ${companies.id} = ${u.id} THEN ${u.score}::real`,
              ),
              sql` `,
            );
            await db
              .update(companies)
              .set({
                priorityScore: sql`CASE ${cases} END`,
                priorityScoreComputedAt: now,
              })
              .where(
                and(
                  eq(companies.tenantId, t.id),
                  sql`${companies.id} = ANY(${ids})`,
                ),
              );
            scored += chunk.length;
          }
        }

        return { scored, skipped };
      });

      perTenant.push({
        tenantId: t.id,
        scored: result.scored,
        skipped: result.skipped,
      });
      totalScored += result.scored;
    }

    return {
      tenants: perTenant.length,
      totalScored,
      perTenant: perTenant.slice(0, 20), // truncate noisy return
    };
  },
);
