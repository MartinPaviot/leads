/**
 * Inngest function: extract LLM signals from newly-ingested emails.
 *
 * Triggered fire-and-forget by the Gmail/Graph sync after writing
 * activities. Concurrency is bounded per tenant so a bulk backfill doesn't
 * exhaust LLM rate limits.
 */

import { inngest } from "./client";
import {
  extractAndPersistForActivity,
  loadCompetitorList,
} from "@/lib/enrichment/email-extract-runner";

interface ExtractSingleEvent {
  name: "enrichment/email-extract-requested";
  data: {
    tenantId: string;
    activityId: string;
  };
}

interface ExtractBatchEvent {
  name: "enrichment/email-extract-batch-requested";
  data: {
    tenantId: string;
    activityIds: string[];
  };
}

export type EnrichmentEmailExtractEvent =
  | ExtractSingleEvent
  | ExtractBatchEvent;

export const enrichmentEmailExtractFunction = inngest.createFunction(
  {
    id: "enrichment-email-extract",
    name: "Email LLM Signal Extractor",
    retries: 1,
    concurrency: [{ limit: 3, key: "event.data.tenantId" }],
    throttle: { limit: 30, period: "1m", key: "event.data.tenantId" },
    triggers: [{ event: "enrichment/email-extract-requested" }],
  },
  async ({ event, step }) => {
    const { tenantId, activityId } = event.data as ExtractSingleEvent["data"];
    const competitorList = await step.run("load-competitors", () =>
      loadCompetitorList(tenantId),
    );
    const outcome = await step.run("extract", () =>
      extractAndPersistForActivity(activityId, tenantId, { competitorList }),
    );

    // ROX-GAP-2: cascade signals to deal properties
    if (outcome.status === "extracted" && outcome.extraction) {
      await step.run("sync-to-deal", () =>
        inngest.send({
          name: "enrichment/signals-extracted",
          data: {
            tenantId,
            activityId,
            signals: outcome.extraction,
          },
        }),
      ).catch(() => { /* non-blocking */ });
    }

    return outcome;
  },
);

export const enrichmentEmailExtractBatchFunction = inngest.createFunction(
  {
    id: "enrichment-email-extract-batch",
    name: "Email LLM Signal Extractor (batch)",
    retries: 0,
    concurrency: [{ limit: 1, key: "event.data.tenantId" }],
    throttle: { limit: 100, period: "5m", key: "event.data.tenantId" },
    triggers: [{ event: "enrichment/email-extract-batch-requested" }],
  },
  async ({ event, step }) => {
    const { tenantId, activityIds } = event.data as ExtractBatchEvent["data"];
    const competitorList = await step.run("load-competitors", () =>
      loadCompetitorList(tenantId),
    );

    const outcomes: unknown[] = [];
    // Serialize within the batch to respect throttles.
    for (const id of activityIds) {
      const outcome = await step.run(`extract-${id}`, () =>
        extractAndPersistForActivity(id, tenantId, { competitorList }),
      );
      outcomes.push(outcome);
    }
    return { processed: activityIds.length, outcomes };
  },
);
