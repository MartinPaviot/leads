/**
 * MONACO-PARITY P0-5 : auto-fill deal fields from extracted signals.
 *
 * Cascade : LLM extracts signals from an email/transcript →
 * `enrichment/signals-extracted` event → this worker resolves
 * conflicts against current `deals.properties` and writes the
 * canonical PropertyEntry shape.
 *
 * Cascade logic itself is a pure function in
 * `lib/deal-autofill/apply-signals.ts` — fully unit-tested without
 * a DB. This file is the IO orchestrator : load deal, run cascade,
 * persist if changed, emit metrics, enqueue LLM-synthesis follow-ups.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { and, eq, notInArray, desc } from "drizzle-orm";
import {
  applySignalsToProperties,
  type SignalsPayload,
} from "@/lib/deal-autofill/apply-signals";
import { logger } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

export const syncSignalsToDeal = inngest.createFunction(
  {
    id: "sync-signals-to-deal",
    retries: 1,
    triggers: [{ event: "enrichment/signals-extracted" }],
  },
  async ({ event, step }: {
    event: {
      data: {
        tenantId: string;
        activityId: string;
        contactId?: string;
        entityId?: string;
        entityType?: string;
        /** ISO timestamp of when the underlying activity occurred —
         *  used as the date attribution on extracted PropertyEntries.
         *  Falls back to event time if absent. */
        activityOccurredAt?: string;
        /** "email" | "transcript" | "meeting_notes" — surfaced as the
         *  PropertyEntry.source for the deal page tooltip. */
        signalSource?: string;
        signals: SignalsPayload;
      };
    };
    step: {
      sendEvent: (id: string, event: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
    };
  }) => {
    const { tenantId, signals, contactId, entityId, entityType } = event.data;

    if (!signals || Object.keys(signals).length === 0) {
      return { skipped: "no signals" };
    }

    let resolvedContactId = contactId;
    if (!resolvedContactId && entityType === "contact" && entityId) {
      resolvedContactId = entityId;
    }
    if (!resolvedContactId) {
      return { skipped: "no contact linked" };
    }

    const openDeals = await db
      .select({ id: deals.id, properties: deals.properties })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          eq(deals.contactId, resolvedContactId),
          notInArray(deals.stage, ["won", "lost"]),
        ),
      )
      .orderBy(desc(deals.updatedAt))
      .limit(1);

    if (openDeals.length === 0) {
      return { skipped: "no open deal for contact" };
    }
    const deal = openDeals[0];

    const eventDate = event.data.activityOccurredAt
      ? new Date(event.data.activityOccurredAt)
      : new Date();
    const source = event.data.signalSource ?? "email";

    const cascade = applySignalsToProperties({
      currentProperties: (deal.properties || {}) as Record<string, unknown>,
      signals,
      eventDate,
      source,
    });

    if (!cascade.hasChanges) {
      return { skipped: "no new signals to sync", dealId: deal.id };
    }

    await db
      .update(deals)
      .set({ properties: cascade.properties, updatedAt: new Date() })
      .where(eq(deals.id, deal.id));

    // Telemetry — counters per field touched, histogram of LLM
    // confidence, plus a counter for genuine conflicts so we can
    // alarm if rule clashes spike (signals an extraction regression).
    // Tags are kept low-cardinality : tenantId is high cardinality
    // and is intentionally NOT a tag — it's emitted on the structured
    // log line for debug traceability instead.
    for (const fu of cascade.fieldUpdates) {
      if (!fu.changed) continue;
      metrics.increment("deal_autofill.field_updated", {
        field: fu.fieldName,
        rule: fu.ruleApplied,
        source: fu.source,
        manual: fu.preservedManual,
      });
      if (fu.confidence !== undefined) {
        metrics.histogram("deal_autofill.confidence", fu.confidence, {
          field: fu.fieldName,
          source: fu.source,
        });
      }
      if (fu.conflict && !fu.preservedManual) {
        metrics.increment("deal_autofill.conflict_resolved", {
          field: fu.fieldName,
          rule: fu.ruleApplied,
        });
      }
      logger.info("deal_autofill.field_updated", {
        tenantId,
        dealId: deal.id,
        field: fu.fieldName,
        rule: fu.ruleApplied,
        source: fu.source,
        confidence: fu.confidence,
        conflict: fu.conflict,
        preservedManual: fu.preservedManual,
      });
    }

    // Enqueue LLM synthesis follow-ups for conflict fields with
    // narrative resolution. Worker `deal-property-llm-synthesize`
    // is the consumer (wired in subsequent task 5.7 alongside the
    // telemetry counters).
    for (const field of cascade.pendingLlmFields) {
      try {
        await step.sendEvent(`llm-synth-${deal.id}-${field}`, {
          name: "deal/property-llm-synthesize",
          data: {
            tenantId,
            dealId: deal.id,
            field,
            activityId: event.data.activityId,
          },
        });
      } catch (err) {
        // Non-blocking — the property write already succeeded.
        logger.warn("deal_autofill.llm_synth_enqueue_failed", {
          tenantId,
          dealId: deal.id,
          field,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      dealId: deal.id,
      fieldsUpdated: cascade.fieldUpdates.filter((f) => f.changed).length,
      pendingLlmFields: cascade.pendingLlmFields,
    };
  },
);
