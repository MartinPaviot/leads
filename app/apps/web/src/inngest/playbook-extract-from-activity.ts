/**
 * Playbook LLM extractor (B4-extractor, _specs/pilae-machine R11.2).
 *
 * Fans in from `coaching/post-interaction` — the same event the
 * coaching engine subscribes to (lib/coaching/interaction-scorer.ts).
 * One transcript drives two parallel analyses without coupling the
 * two Inngest fns.
 *
 * Flow:
 *   1. Load the activity (tenant-scoped).
 *   2. Build the extraction prompt via `buildExtractionPrompt`.
 *   3. Call Claude with `extractionResponseSchema` to get typed entries.
 *   4. Emit `playbook/capture-from-activity` to the sink (d7ed10a),
 *      which re-validates via `validatePlaybookBatch` and inserts.
 *
 * The producer trusts the schema validation; the sink is the security
 * boundary. Both gates use the same `PLAYBOOK_ENTRY_TYPES` /
 * length constraints — drift between them would surface immediately
 * as rejected inserts in the sink logs.
 *
 * Failure-tolerant: a missing LLM key or a model error doesn't block
 * the coaching engine (separate fn). The catch returns `{ skipped }`
 * so the call doesn't enter retry loops on permanent config errors.
 */

import { inngest } from "./client";
import { isFeatureEnabled } from "@/lib/config/feature-gate";
import { db } from "@/db";
import { activities, deals, contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import {
  buildExtractionPrompt,
  extractionResponseSchema,
} from "@/lib/playbook/extractor-prompt";
import { logger } from "@/lib/observability/logger";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

type PostInteractionEvent = {
  data: {
    tenantId: string;
    activityId: string;
    userId?: string;
  };
};

export const playbookExtractFromActivity = inngest.createFunction(
  {
    id: "playbook-extract-from-activity",
    name: "Playbook: LLM-extract entries from post-interaction",
    retries: 1,
    triggers: [{ event: "coaching/post-interaction" }],
  },
  async ({ event, step }: { event: PostInteractionEvent; step: any }) => {
    if (!isFeatureEnabled(process.env.PLAYBOOK_EXTRACT_ENABLED)) {
      return { skipped: "PLAYBOOK_EXTRACT_ENABLED=off" };
    }
    const { tenantId, activityId } = event.data;

    const model = getLLMModel();
    if (!model) {
      return { skipped: "no_llm_key" };
    }

    const [activity] = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.id, activityId),
          eq(activities.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!activity) return { skipped: "activity_not_found" };
    const content = activity.rawContent || activity.summary || "";
    if (!content || content.length < 50) {
      // Fragments shorter than 50 chars can't yield a 5-char learning
      // with anything close to confidence; skip rather than waste
      // tokens.
      return { skipped: "content_too_short" };
    }

    // Optional context lookups — these are cheap one-row queries and
    // their absence falls back to null without blocking extraction.
    let dealStage: string | null = null;
    let contactTitle: string | null = null;

    if (activity.entityType === "deal") {
      const [deal] = await db
        .select({ stage: deals.stage })
        .from(deals)
        .where(eq(deals.id, activity.entityId))
        .limit(1);
      dealStage = deal?.stage ?? null;
    } else if (activity.entityType === "contact") {
      const [contact] = await db
        .select({ title: contacts.title })
        .from(contacts)
        .where(eq(contacts.id, activity.entityId))
        .limit(1);
      contactTitle = contact?.title ?? null;
    }

    const prompt = buildExtractionPrompt({
      interactionType: activity.activityType,
      direction:
        (activity.direction as
          | "inbound"
          | "outbound"
          | "internal"
          | undefined) ?? "unknown",
      dealStage,
      contactTitle,
      content,
    });

    let parsed: { entries: Array<{ type: string; content: string; outcomeLabel?: string | null; perfScore?: number | null }> };
    try {
      const result = await step.run("llm-extract", async () =>
        tracedGenerateObject({
          model,
          schema: extractionResponseSchema,
          prompt,
        }),
      );
      // The Vercel AI SDK's generateObject returns `{ object }` or
      // returns the parsed object directly depending on version; the
      // tracedGenerateObject wrapper exposes `.object`.
      parsed = (result as { object: typeof result }).object as never;
    } catch (err) {
      logger.warn("playbook-extract.llm_failed", {
        tenantId,
        activityId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { skipped: "llm_error" };
    }

    if (!parsed?.entries?.length) {
      return { extracted: 0, reason: "no_entries_returned" };
    }

    await step.run("emit-to-sink", async () => {
      await inngest.send({
        name: "playbook/capture-from-activity",
        data: {
          tenantId,
          sourceActivityId: activityId,
          entries: parsed.entries,
        },
      });
    });

    return {
      extracted: parsed.entries.length,
      tenantId,
      activityId,
    };
  },
);
