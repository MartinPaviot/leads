import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { tracedGenerateText } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";

/**
 * CHAT-06: Research Agent worker (v1 scaffold).
 *
 * Triggered by the `research-agent/run` event fired from the
 * runAiAttribute tool when a custom field of kind='research' needs
 * to be computed. v1 runs a single LLM call with the prompt —
 * multi-step web browsing (Attio-parity) is a v2 that adds tool-use
 * inside the agent loop + web-fetch capability.
 *
 * Contract:
 *   event.data = {
 *     tenantId, entityType, recordId, fieldId, prompt, jobId?
 *   }
 * On success: writes result to record.properties.customFields[fieldId]
 * and stamps updatedAt. Emits `research-agent/completed` with the
 * jobId + resulting text so future UI progress cards can subscribe.
 * On failure: emits `research-agent/failed` with the error.
 */

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickTable(entityType: string): any {
  if (entityType === "contact") return contacts;
  if (entityType === "company" || entityType === "account") return companies;
  if (entityType === "deal") return deals;
  return null;
}

export const researchAgent = inngest.createFunction(
  {
    id: "research-agent-run",
    name: "Research Agent — AI attribute compute",
    retries: 1,
    concurrency: [{ limit: 3, key: "event.data.tenantId" }],
    triggers: [{ event: "research-agent/run" }],
  },
  async ({ event, step }) => {
    const { tenantId, entityType, recordId, fieldId, prompt, jobId } =
      event.data as {
        tenantId: string;
        entityType: string;
        recordId: string;
        fieldId: string;
        prompt: string;
        jobId?: string;
      };

    const model = await step.run("check-model", async () => {
      const m = getLLMModel();
      return m ? "ok" : null;
    });
    if (!model) {
      await inngest.send({
        name: "research-agent/failed",
        data: { jobId, error: "No LLM API key configured" },
      });
      return { ok: false, error: "No LLM API key configured" };
    }

    const record = await step.run("load-record", async () => {
      const table = pickTable(entityType);
      if (!table) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [row] = await db
        .select()
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where(and(eq((table as any).id, recordId), eq((table as any).tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!record) {
      await inngest.send({
        name: "research-agent/failed",
        data: { jobId, error: "Record not found" },
      });
      return { ok: false, error: "Record not found" };
    }

    // Build the compound prompt with record context + {{var}} interpolation
    const composedPrompt = await step.run("compose-prompt", async () => {
      const rec = record as Record<string, unknown>;
      const interpolated = prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const v = rec[key];
        return v === undefined || v === null ? "" : String(v);
      });

      // Snapshot the record's loud fields into context
      const ctx: string[] = [];
      for (const k of ["name", "firstName", "lastName", "email", "domain", "industry", "title", "description", "summary", "stage", "value"]) {
        const v = rec[k];
        if (v !== undefined && v !== null && v !== "") {
          ctx.push(`${k}: ${v}`);
        }
      }
      return `${interpolated}\n\nRecord context:\n${ctx.join("\n")}`;
    });

    const result: { ok: boolean; text: string; error: string } = await step.run(
      "llm-call",
      async () => {
        const m = getLLMModel();
        if (!m) return { ok: false, text: "", error: "model unavailable" };
        try {
          const { text } = await tracedGenerateText({
            model: m,
            prompt: composedPrompt,
            _trace: {
              agentId: "research-agent",
              tenantId,
              inputPreview: composedPrompt.slice(0, 300),
            },
          });
          return { ok: true, text: (text || "").trim(), error: "" };
        } catch (err) {
          return {
            ok: false,
            text: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    );

    if (!result.ok) {
      await inngest.send({
        name: "research-agent/failed",
        data: { jobId, error: result.error },
      });
      return { ok: false, error: result.error };
    }

    await step.run("persist-result", async () => {
      const table = pickTable(entityType);
      if (!table) return;
      const rec = record as Record<string, unknown>;
      const props = (rec.properties as Record<string, unknown>) || {};
      const cfMap =
        ((props.customFields as Record<string, unknown>) || {}) as Record<string, unknown>;
      const nextProps = {
        ...props,
        customFields: { ...cfMap, [fieldId]: result.text },
      };
      await db
        .update(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ properties: nextProps, updatedAt: new Date() } as any)
        .where(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          and(eq((table as any).id, recordId), eq((table as any).tenantId, tenantId))
        );
    });

    await inngest.send({
      name: "research-agent/completed",
      data: { jobId, tenantId, entityType, recordId, fieldId, text: result.text },
    });

    return { ok: true, jobId, text: result.text };
  }
);
