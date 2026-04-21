/**
 * Custom signal backfill.
 *
 * Triggered when a user creates a new custom signal. Iterates over
 * every company in the tenant's TAM and runs the signal detector,
 * writing results to `companies.properties.customSignals[signalId]`.
 *
 * Stamps `custom_signals.backfilledAt` on completion so the UI can
 * hide the "Backfilling…" banner under the column header.
 *
 * Batches companies in groups of 20 with per-batch step boundaries
 * so Inngest retries only replay the failing batch, not the whole
 * thousand-row scan. The detector itself never throws — batches
 * can only fail on DB IO.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { companies, customSignals } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { detectCustomSignal } from "@/lib/custom-signals/detector";
import type {
  CustomSignalDefinition,
  CustomSignalResult,
} from "@/lib/custom-signals/types";

const BATCH_SIZE = 20;

export const customSignalBackfill = inngest.createFunction(
  {
    id: "custom-signal-backfill",
    name: "Custom signal — backfill TAM",
    retries: 2,
    // Concurrency-1 per signalId so re-triggering the same backfill
    // (e.g. from a user-side retry) doesn't create duplicate writes.
    concurrency: [
      {
        key: "event.data.signalId",
        limit: 1,
      },
    ],
    triggers: [{ event: "custom-signal/backfill" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { tenantId: string; signalId: string } };
    step: any;
  }) => {
    const { tenantId, signalId } = event.data;

    // Load signal definition once.
    const signal = await step.run("load-signal", async () => {
      const [row] = await db
        .select()
        .from(customSignals)
        .where(
          and(
            eq(customSignals.id, signalId),
            eq(customSignals.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        plan: row.plan as CustomSignalDefinition["plan"],
      } satisfies CustomSignalDefinition;
    });

    if (!signal) {
      return { error: "Signal not found or deactivated" };
    }

    // Load all company IDs + the slice of properties the detector needs.
    const allCompanies = await step.run("load-companies", async () => {
      return db
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          description: companies.description,
          properties: companies.properties,
        })
        .from(companies)
        .where(eq(companies.tenantId, tenantId));
    });

    let processed = 0;
    let matched = 0;

    type CompanyRow = {
      id: string;
      name: string;
      domain: string | null;
      description: string | null;
      properties: unknown;
    };
    const rows = allCompanies as CompanyRow[];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const result = await step.run(`batch-${i}`, async () => {
        const results = await Promise.all(
          batch.map(async (c: CompanyRow) => {
            const props = (c.properties || {}) as Record<string, unknown>;
            const keywords = Array.isArray(props.keywords)
              ? (props.keywords as string[])
              : [];
            const technologies = Array.isArray(props.technologies)
              ? (props.technologies as string[])
              : [];

            const detection = await detectCustomSignal(
              signal,
              {
                name: c.name,
                domain: c.domain,
                description: c.description,
                keywords,
                technologies,
              },
              { tenantId },
            );

            return { companyId: c.id, detection };
          }),
        );

        // Persist each row's result. We merge into
        // `properties.customSignals[signalId]` rather than
        // overwriting `properties` so other fields survive.
        let localMatched = 0;
        for (const r of results) {
          if (r.detection.value) localMatched++;
          const patch: Record<string, Record<string, CustomSignalResult>> = {
            customSignals: { [signalId]: r.detection },
          };
          await db
            .update(companies)
            .set({
              properties: sql`COALESCE(${companies.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(companies.id, r.companyId),
                eq(companies.tenantId, tenantId),
              ),
            );
        }
        return { size: batch.length, matched: localMatched };
      });
      processed += result.size;
      matched += result.matched;
    }

    await step.run("mark-backfilled", async () => {
      await db
        .update(customSignals)
        .set({ backfilledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(customSignals.id, signalId),
            eq(customSignals.tenantId, tenantId),
          ),
        );
    });

    return { signalId, processed, matched };
  },
);
