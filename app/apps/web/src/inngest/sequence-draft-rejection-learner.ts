/**
 * Draft rejection learner — evaluator-optimizer pattern (P0-1 task 1.6).
 *
 * Triggered by `draft.rejected` (emitted by the reject API route).
 * Pulls every rejection for the affected sequence in the last 14
 * days, classifies them via the heuristic in
 * `lib/sequence-drafts/rejection-classifier.ts`, and writes the
 * dominant-category insight to `sequences.campaignConfig.rejectionInsights`.
 *
 * The personalisation prompt reads `rejectionInsights.dominantInsight`
 * from the sequence and prepends a counter-instruction
 * ("This sequence has 5 rejections for 'tone' — soften.") so future
 * drafts auto-correct.
 *
 * Why a separate fn rather than inline in the reject route :
 *  - Heavy aggregation (all rejections for the sequence over a
 *    window) doesn't belong on the request hot path.
 *  - Inngest gives us retries, dead-letter, and observability for
 *    free. A failure here doesn't block the rejection.
 *  - The eventual LLM-graded version (post-P0) plugs in here
 *    without changing the API route.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { sequenceDrafts, sequences } from "@/db/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import {
  classifyRejection,
  aggregateRejections,
  dominantInsight,
} from "@/lib/sequence-drafts/rejection-classifier";
import { logger } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

const LOOKBACK_DAYS = 14;

export const draftRejectionLearner = inngest.createFunction(
  {
    id: "sequence-draft-rejection-learner",
    name: "Sequence Draft Rejection Learner",
    retries: 1,
    onFailure: async ({ error, event }) => {
      logger.error("draft-rejection-learner.dead_letter", {
        sequenceId: (event as { data?: { sequenceId?: string } }).data
          ?.sequenceId,
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ event: "draft.rejected" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        draftId: string;
        tenantId: string;
        reason: string;
        sequenceId: string;
        stepId?: string;
      };
    };
    step: {
      run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
    };
  }) => {
    const { sequenceId, tenantId, reason } = event.data;

    // 1) Telemetry — every rejection emits a counter regardless of
    // whether the learner derives a new insight.
    const classifiedNow = classifyRejection(reason);
    metrics.increment("sequence_drafts.rejected", {
      tenantId,
      sequenceId,
      category: classifiedNow.category,
    });

    // 2) Pull all rejected drafts for this sequence in the lookback
    // window. Drizzle index `sequence_drafts_sequence_age_idx` hits
    // this with a single scan.
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const allRejected = await step.run("fetch-rejections", async () =>
      db
        .select({
          reviewReason: sequenceDrafts.reviewReason,
          reviewedAt: sequenceDrafts.reviewedAt,
        })
        .from(sequenceDrafts)
        .where(
          and(
            eq(sequenceDrafts.tenantId, tenantId),
            eq(sequenceDrafts.sequenceId, sequenceId),
            eq(sequenceDrafts.status, "rejected"),
            isNotNull(sequenceDrafts.reviewReason),
            gte(sequenceDrafts.reviewedAt, cutoff),
          ),
        )
        .limit(500),
    );

    // 3) Classify each, aggregate, pick dominant.
    const classified = allRejected
      .filter((r) => typeof r.reviewReason === "string")
      .map((r) => classifyRejection(r.reviewReason as string));
    const counts = aggregateRejections(classified);
    const insight = dominantInsight(counts);

    // 4) Persist into `sequences.campaignConfig.rejectionInsights`.
    // We merge into existing campaignConfig rather than overwrite —
    // other consumers store unrelated keys there.
    await step.run("persist-insight", async () => {
      const [seq] = await db
        .select({ campaignConfig: sequences.campaignConfig })
        .from(sequences)
        .where(
          and(eq(sequences.id, sequenceId), eq(sequences.tenantId, tenantId)),
        )
        .limit(1);

      const config: Record<string, unknown> =
        (seq?.campaignConfig as Record<string, unknown> | null) ?? {};

      config.rejectionInsights = {
        lookbackDays: LOOKBACK_DAYS,
        lastUpdated: new Date().toISOString(),
        totalRejections: classified.length,
        byCategory: counts,
        dominantInsight: insight,
        // Latest reason — useful for displaying the most recent
        // founder feedback in the UI without another query.
        lastReason: reason.slice(0, 280),
      };

      await db
        .update(sequences)
        .set({ campaignConfig: config, updatedAt: new Date() })
        .where(
          and(eq(sequences.id, sequenceId), eq(sequences.tenantId, tenantId)),
        );
    });

    if (insight) {
      metrics.increment("sequence_drafts.insight_emitted", {
        tenantId,
        sequenceId,
        category: insight.category,
      });
      logger.info("draft-rejection-learner.insight", {
        tenantId,
        sequenceId,
        category: insight.category,
        count: insight.count,
        totalRejections: classified.length,
      });
    }

    return {
      sequenceId,
      totalRejections: classified.length,
      counts,
      insight,
    };
  },
);
