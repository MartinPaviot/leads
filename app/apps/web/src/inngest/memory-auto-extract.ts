import { inngest } from "./client";
import { isFeatureEnabled } from "@/lib/config/feature-gate";
import { db } from "@/db";
import { chatMessages, chatMemories } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

/**
 * CHAT-07: Memory auto-extraction worker.
 *
 * Scans the last ~20 messages of a chat thread and asks the LLM to
 * extract stable, persistent facts that belong in long-term memory
 * (user preferences, team-level decisions, relationship notes about
 * specific accounts). Extracted items are INSERTED INTO chat_memories
 * with category='auto_extracted' so they show up in recallMemories
 * alongside explicit rememberContext saves — but marked as proposed
 * via the category so a future UI can filter them for user approval.
 *
 * Trigger: `memory/auto-extract` with { tenantId, userId, threadId }.
 * Typically fired by the chat route.ts on every Nth turn or when the
 * thread closes. v1: explicit event only — caller decides cadence.
 */

const extractedMemorySchema = z.object({
  memories: z
    .array(
      z.object({
        key: z.string().describe("Short snake_case identifier"),
        content: z.string().describe("The memory content — one sentence"),
        category: z
          .enum(["user_preference", "decision", "learned_context", "relationship_note"])
          .describe("Memory category"),
        scope: z
          .enum(["user", "workspace"])
          .describe("user = private preference; workspace = team-relevant fact"),
      })
    )
    .max(10)
    .describe("Up to 10 concrete, stable facts worth remembering"),
});

function getLLMModel() {
  // Memory extraction is a structured-extraction task (its OpenAI fallback is
  // already gpt-4o-mini) — Haiku gives equivalent quality at 0.21x Sonnet.
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export const memoryAutoExtract = inngest.createFunction(
  {
    id: "memory-auto-extract",
    name: "Memory — auto-extract from conversation",
    retries: 1,
    concurrency: [{ limit: 2, key: "event.data.tenantId" }],
    triggers: [{ event: "memory/auto-extract" }],
  },
  async ({ event, step }) => {
    if (!isFeatureEnabled(process.env.MEMORY_EXTRACT_ENABLED)) {
      return { ok: false, skipped: "MEMORY_EXTRACT_ENABLED=off" };
    }
    const { tenantId, userId, threadId } = event.data as {
      tenantId: string;
      userId: string;
      threadId: string;
    };

    const model = getLLMModel();
    if (!model) return { ok: false, error: "No LLM API key" };

    const recentMessages = await step.run("load-recent-messages", async () => {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);
      return rows.reverse(); // chronological
    });

    if (recentMessages.length < 4) {
      return { ok: false, error: "Thread too short to extract memories" };
    }

    const transcript = recentMessages
      .map((m) => `[${m.role}] ${m.content.slice(0, 500)}`)
      .join("\n\n");

    const extracted: {
      memories: Array<{
        key: string;
        content: string;
        category: "user_preference" | "decision" | "learned_context" | "relationship_note";
        scope: "user" | "workspace";
      }>;
    } = await step.run("llm-extract", async () => {
      const { object } = await tracedGenerateObject({
        model,
        schema: extractedMemorySchema,
        prompt: `You are extracting durable facts from a CRM chat conversation that should persist in long-term memory for future sessions.

Rules:
- Only extract STABLE facts that will still be true in a month (user preferences, team decisions, account-specific insights, ICP refinements).
- NEVER extract transient context (the user's question, a one-off task, current conversation state).
- NEVER extract facts already implicit in the CRM data (record names, emails — the user can re-read those).
- Classify scope='workspace' ONLY for team-level facts ("our pricing", "our ICP", "our objection handler for X"). Default scope='user' for anything personal.
- Return at most 10 memories. Empty array is fine if nothing worth remembering.

Conversation (most recent ~20 turns):
${transcript}`,
        _trace: {
          agentId: "memory-auto-extract",
          tenantId,
          inputPreview: `threadId=${threadId} msgs=${recentMessages.length}`,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return object as any;
    });

    if (!extracted.memories || extracted.memories.length === 0) {
      return { ok: true, extracted: 0 };
    }

    const inserted = await step.run("persist-memories", async () => {
      let count = 0;
      for (const m of extracted.memories) {
        // Skip if same (tenantId, scope, key) already exists — avoid
        // clobbering existing explicit saves.
        const where =
          m.scope === "user"
            ? and(
                eq(chatMemories.tenantId, tenantId),
                eq(chatMemories.userId, userId),
                eq(chatMemories.scope, "user"),
                eq(chatMemories.key, m.key)
              )
            : and(
                eq(chatMemories.tenantId, tenantId),
                eq(chatMemories.scope, "workspace"),
                eq(chatMemories.key, m.key)
              );
        const [existing] = await db.select().from(chatMemories).where(where).limit(1);
        if (existing) continue;

        await db.insert(chatMemories).values({
          tenantId,
          userId,
          key: m.key,
          content: m.content,
          // Tag as auto_extracted-prefixed category so UI can filter
          // for approval. Falls back to the LLM's category for recall.
          category: `auto_extracted:${m.category}`,
          scope: m.scope,
        });
        count++;
      }
      return count;
    });

    await inngest.send({
      name: "memory/extracted",
      data: {
        tenantId,
        userId,
        threadId,
        insertedCount: inserted,
        proposed: extracted.memories,
      },
    });

    return { ok: true, extracted: inserted };
  }
);
