/**
 * Inngest worker — consume `deal/property-llm-synthesize` events
 * (P0-5 follow-up).
 *
 * The autofill cascade (`inngest/deal-signal-sync.ts`) defers
 * narrative-field conflicts to an async LLM round-trip : `why_now`
 * and `summary` need a paragraph synthesise, not a "latest wins"
 * coin-flip. The cascade emits one event per pending field ; this
 * worker consumes them, calls the LLM via the existing traced-ai
 * wrapper, and writes the synthesised paragraph back via
 * `setDealProperty` (preserving the manual flag if the user re-pinned
 * the field while the synthesise was in flight).
 *
 * Pure prompt + validation logic lives in
 * `lib/deal-autofill/llm-synthesize-prompt.ts` ; this file is the
 * IO orchestrator.
 */

import { inngest } from "./client";
import { isFeatureEnabled } from "@/lib/config/feature-gate";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  buildSynthesizePrompt,
  validateSynthesizeResult,
} from "@/lib/deal-autofill/llm-synthesize-prompt";
import {
  isPropertyEntry,
  setDealProperty,
} from "@/lib/deal-autofill/property-accessor";
import type { PropertyEntry } from "@/lib/deal-autofill/conflict-resolution";
import { logger } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

interface SynthesizeEvent {
  data: {
    tenantId: string;
    dealId: string;
    field: string;
    /** Optional — the activity that triggered the cascade ; carried
     *  through for trace stitching. */
    activityId?: string;
  };
}

const SUPPORTED_FIELDS = new Set(["why_now", "summary"]);

export const dealPropertyLlmSynthesize = inngest.createFunction(
  {
    id: "deal-property-llm-synthesize",
    name: "Deal property LLM synthesise (why_now / summary)",
    retries: 1,
    onFailure: async ({ error, event }) => {
      logger.error("deal-property-llm-synthesize.dead_letter", {
        dealId: (event as any).data?.dealId,
        field: (event as any).data?.field,
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ event: "deal/property-llm-synthesize" }],
  },
  async ({
    event,
    step,
  }: {
    event: SynthesizeEvent;
    step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> };
  }) => {
    if (!isFeatureEnabled(process.env.DEAL_PROPERTY_ENABLED)) {
      return { skipped: "DEAL_PROPERTY_ENABLED=off" };
    }
    const { tenantId, dealId, field } = event.data;

    if (!SUPPORTED_FIELDS.has(field)) {
      return { skipped: "unsupported_field", field };
    }

    // 1) Load the deal.
    const [deal] = await db
      .select({
        id: deals.id,
        name: deals.name,
        stage: deals.stage,
        value: deals.value,
        properties: deals.properties,
      })
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
      .limit(1);

    if (!deal) {
      return { skipped: "deal_not_found", dealId };
    }

    const props = (deal.properties || {}) as Record<string, unknown>;
    const rawCurrent = props[field];

    // 2) Read current entry (must be PropertyEntry for synthesise to
    // make sense — legacy primitives don't carry the source/date
    // metadata we need). Skip cleanly when the field has been
    // manually pinned during the round-trip.
    if (!isPropertyEntry(rawCurrent)) {
      return { skipped: "field_not_in_new_shape", field };
    }
    const current = rawCurrent as PropertyEntry<string>;
    if (current.manual) {
      logger.info("llm-synthesize: manual pin protects field, skipping", {
        tenantId,
        dealId,
        field,
      });
      metrics.increment("deal_autofill.synthesize_skipped_manual", { field });
      return { skipped: "manual_pin", field };
    }

    // The cascade's incoming entry isn't carried in the event ; we
    // synthesise the current entry against its history (the prior
    // version stored when latest_wins fired). The first entry of
    // `<field>_history` is the most recently displaced narrative.
    const historyKey = `${field}_history`;
    const historyRaw = props[historyKey];
    const history = Array.isArray(historyRaw)
      ? (historyRaw as PropertyEntry<string>[])
      : [];
    const incoming = history.length > 0 ? history[history.length - 1] : null;

    if (!incoming) {
      // Nothing to synthesise against — the current entry IS the
      // narrative ; treat as no-op. Surfaces in metrics so we can
      // detect a misconfigured cascade.
      logger.info("llm-synthesize: no history entry to synthesise against", {
        tenantId,
        dealId,
        field,
      });
      metrics.increment("deal_autofill.synthesize_no_history", { field });
      return { skipped: "no_history", field };
    }

    if (typeof current.value !== "string" || typeof incoming.value !== "string") {
      return { skipped: "non_string_value", field };
    }

    // 3) Compose prompt + call LLM.
    const prompt = buildSynthesizePrompt({
      field,
      current: {
        value: current.value,
        source: current.source,
        date: current.date,
      },
      incoming: {
        value: incoming.value,
        source: incoming.source,
        date: incoming.date,
      },
      dealContext: {
        name: deal.name,
        stage: deal.stage ?? "lead",
        value: deal.value ?? null,
      },
    });

    const synthesised = await step.run("call-llm", async () => {
      // Lazy-import the LLM wrapper so this module stays loadable in
      // environments without API keys (e.g. unit tests).
      const { tracedGenerateText } = await import("@/lib/ai/traced-ai");
      const { anthropic } = await import("@/lib/ai/ai-provider");
      const { openai } = await import("@ai-sdk/openai");
      const model = process.env.ANTHROPIC_API_KEY
        ? anthropic("claude-sonnet-4-6")
        : process.env.OPENAI_API_KEY
          ? openai("gpt-4o-mini")
          : null;
      if (!model) {
        throw new Error("LLM_KEY_MISSING");
      }
      const result = await tracedGenerateText({
        model,
        system: prompt.system,
        prompt: prompt.user,
        _trace: {
          agentId: "deal-property-llm-synthesize",
          tenantId,
          metadata: { dealId, field },
        },
      } as never);
      return (result as { text: string }).text;
    });

    const validated = validateSynthesizeResult(synthesised);
    if (!validated.ok) {
      logger.warn("llm-synthesize: result rejected", {
        tenantId,
        dealId,
        field,
        reason: validated.reason,
      });
      metrics.increment("deal_autofill.synthesize_rejected", {
        field,
        reason: validated.reason,
      });
      return {
        skipped: "result_rejected",
        field,
        reason: validated.reason,
      };
    }

    // 4) Re-load the deal in case the user pinned the field manually
    // during the round-trip, then write back via setDealProperty.
    // The race-safety here is best-effort : if a manual pin landed,
    // we skip ; if a different LLM result landed, last-writer-wins
    // (rare ; only happens on duplicate event delivery).
    await step.run("persist-synthesised", async () => {
      const [latest] = await db
        .select({ properties: deals.properties })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);
      if (!latest) return;
      const latestProps = (latest.properties || {}) as Record<string, unknown>;
      const latestEntry = latestProps[field];
      if (isPropertyEntry(latestEntry) && latestEntry.manual) {
        logger.info("llm-synthesize: manual pin landed mid-flight, skipping write", {
          tenantId,
          dealId,
          field,
        });
        return;
      }
      const newProps = setDealProperty(latestProps, field, {
        value: validated.value,
        source: "llm_synthesised",
        date: new Date(),
        manual: false,
        confidence: 0.85, // narrative confidence — not provider-derived
      });
      await db
        .update(deals)
        .set({ properties: newProps, updatedAt: new Date() })
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));
    });

    metrics.increment("deal_autofill.synthesize_persisted", { field });
    return {
      dealId,
      field,
      length: validated.value.length,
    };
  },
);
