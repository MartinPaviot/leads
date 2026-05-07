/**
 * Inngest function: extract thread-level intelligence from email threads.
 *
 * Triggered after email sync completes. Groups newly synced emails by
 * threadId and runs the thread intelligence extractor on each thread
 * that has >= 2 emails.
 *
 * Concurrency is bounded per tenant to avoid LLM rate limit exhaustion.
 */

import { inngest } from "./client";
import {
  extractAndPersistThreadIntelligence,
} from "@/lib/emails/email-intelligence";
import { processIntelligenceActions } from "@/lib/emails/email-intelligence-actions";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

interface ThreadIntelligenceEvent {
  name: "enrichment/thread-intelligence-requested";
  data: {
    tenantId: string;
    threadIds: string[];
  };
}

/**
 * Batch thread intelligence extraction. Receives a list of threadIds
 * from the email sync pipeline and processes each one sequentially
 * to respect LLM rate limits.
 */
export const extractThreadIntelligenceBatch = inngest.createFunction(
  {
    id: "extract-thread-intelligence-batch",
    name: "Email Thread Intelligence Extractor (batch)",
    retries: 1,
    concurrency: [{ limit: 2, key: "event.data.tenantId" }],
    throttle: { limit: 20, period: "5m", key: "event.data.tenantId" },
    triggers: [{ event: "enrichment/thread-intelligence-requested" }],
  },
  async ({ event, step }) => {
    const { tenantId, threadIds } = event.data as ThreadIntelligenceEvent["data"];

    if (!threadIds || threadIds.length === 0) {
      return { processed: 0, reason: "no_thread_ids" };
    }

    // Load tenant settings once for the whole batch
    const settings = await step.run("load-settings", async () => {
      const s = await getTenantSettings(tenantId);
      return {
        productDescription: s.productDescription || "",
      };
    });

    // Deduplicate threadIds
    const uniqueThreadIds = [...new Set(threadIds)];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (const threadId of uniqueThreadIds) {
      const result = await step.run(`extract-${threadId}`, async () => {
        try {
          const intelligence = await extractAndPersistThreadIntelligence(
            tenantId,
            threadId,
            settings,
          );
          if (intelligence) {
            // Resolve deal/contact linked to this thread for action chains
            const linkedEntities = await resolveThreadEntities(tenantId, threadId);

            // Fire intelligence action chains (non-blocking — failures
            // should never prevent intelligence persistence)
            await processIntelligenceActions(
              intelligence,
              tenantId,
              linkedEntities.dealId,
              linkedEntities.contactId,
            ).catch((err) =>
              console.warn(
                `Thread intelligence actions failed for thread ${threadId}:`,
                err,
              ),
            );

            return "extracted" as const;
          }
          return "skipped" as const; // Too few emails or no model
        } catch (err) {
          console.warn(
            `Thread intelligence extraction failed for thread ${threadId}:`,
            err,
          );
          return "error" as const;
        }
      });

      if (result === "extracted") succeeded++;
      else if (result === "skipped") skipped++;
      else failed++;
    }

    return {
      processed: uniqueThreadIds.length,
      succeeded,
      skipped,
      failed,
    };
  },
);

/**
 * Single-thread intelligence extraction. Can be triggered on-demand
 * (e.g. from a "Refresh intelligence" button on a thread view).
 */
export const extractSingleThreadIntelligence = inngest.createFunction(
  {
    id: "extract-single-thread-intelligence",
    name: "Email Thread Intelligence Extractor (single)",
    retries: 1,
    concurrency: [{ limit: 3, key: "event.data.tenantId" }],
    triggers: [{ event: "enrichment/thread-intelligence-single-requested" }],
  },
  async ({ event, step }) => {
    const { tenantId, threadId } = event.data as {
      tenantId: string;
      threadId: string;
    };

    const settings = await step.run("load-settings", async () => {
      const s = await getTenantSettings(tenantId);
      return {
        productDescription: s.productDescription || "",
      };
    });

    const intelligence = await step.run("extract", async () => {
      return extractAndPersistThreadIntelligence(tenantId, threadId, settings);
    });

    // Fire intelligence action chains if extraction succeeded
    if (intelligence) {
      await step.run("process-actions", async () => {
        const linkedEntities = await resolveThreadEntities(tenantId, threadId);
        return processIntelligenceActions(
          intelligence,
          tenantId,
          linkedEntities.dealId,
          linkedEntities.contactId,
        );
      });
    }

    return {
      threadId,
      status: intelligence ? "extracted" : "skipped",
      intelligence,
    };
  },
);

// ── Helper: resolve deal/contact linked to a thread ───────────

/**
 * Look up which deal and contact are associated with a thread's emails.
 * Checks the activities table for entity references linked to the thread.
 */
async function resolveThreadEntities(
  tenantId: string,
  threadId: string,
): Promise<{ dealId?: string; contactId?: string }> {
  try {
    const threadActivities = await db
      .select({
        entityType: activities.entityType,
        entityId: activities.entityId,
        metadata: activities.metadata,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.threadId, threadId),
        ),
      )
      .limit(20);

    let dealId: string | undefined;
    let contactId: string | undefined;

    for (const act of threadActivities) {
      if (act.entityType === "deal" && act.entityId) {
        dealId = act.entityId;
      }
      if (act.entityType === "contact" && act.entityId) {
        contactId = act.entityId;
      }
      // Also check metadata for linked entities
      const meta = (act.metadata || {}) as Record<string, unknown>;
      if (meta.dealId && typeof meta.dealId === "string") {
        dealId = dealId || meta.dealId;
      }
      if (meta.contactId && typeof meta.contactId === "string") {
        contactId = contactId || meta.contactId;
      }
    }

    return { dealId, contactId };
  } catch {
    return {};
  }
}
