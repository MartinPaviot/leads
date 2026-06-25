/**
 * CHAT-06: AI Attributes — execute a workspace-defined ai_computed
 * custom field on a single record, in-process. For long-running
 * "research" kind we enqueue an Inngest job and return a jobId
 * placeholder (the Inngest worker is a follow-up).
 *
 * The record's properties.customFields[fieldId] is updated with the
 * computed value on success.
 */

import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getTenantSettings, type CustomFieldDef } from "@/lib/config/tenant-settings";
import { inngest } from "@/inngest/client";

export interface RunAiAttributeResult {
  ok: boolean;
  value?: string;
  jobId?: string; // present for long-running "research"
  error?: string;
}

function pickModel() {
  return process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickTable(entityType: string): any {
  if (entityType === "contact") return contacts;
  if (entityType === "company" || entityType === "account") return companies;
  if (entityType === "deal") return deals;
  return null;
}

function recordToContext(entityType: string, record: Record<string, unknown>): string {
  if (entityType === "contact") {
    const c = record as typeof contacts.$inferSelect;
    return [
      `Name: ${[c.firstName, c.lastName].filter(Boolean).join(" ")}`,
      `Email: ${c.email || "unknown"}`,
      `Title: ${c.title || "unknown"}`,
      `Phone: ${c.phone || "unknown"}`,
    ].join("\n");
  }
  if (entityType === "company" || entityType === "account") {
    const c = record as typeof companies.$inferSelect;
    return [
      `Company: ${c.name}`,
      `Domain: ${c.domain || "unknown"}`,
      `Industry: ${c.industry || "unknown"}`,
      `Size: ${c.size || "unknown"}`,
      `Revenue: ${c.revenue || "unknown"}`,
      `Description: ${c.description || "unknown"}`,
    ].join("\n");
  }
  if (entityType === "deal") {
    const d = record as typeof deals.$inferSelect;
    return [
      `Deal: ${d.name}`,
      `Stage: ${d.stage}`,
      `Value: ${d.value || "unknown"}`,
      `Summary: ${d.summary || "unknown"}`,
      `Expected close: ${d.expectedCloseDate || "unknown"}`,
    ].join("\n");
  }
  return JSON.stringify(record).slice(0, 1000);
}

export async function runAiAttribute(
  tenantId: string,
  recordEntityType: string,
  recordId: string,
  fieldId: string
): Promise<RunAiAttributeResult> {
  const settings = await getTenantSettings(tenantId);
  const field: CustomFieldDef | undefined = (settings.customFields || []).find(
    (f) => f.id === fieldId && f.entityType === recordEntityType
  );
  if (!field) return { ok: false, error: "AI field not found on this object type" };
  if (field.type !== "ai_computed" || !field.aiConfig) {
    return { ok: false, error: "Field is not an AI-computed attribute" };
  }

  const table = pickTable(recordEntityType);
  if (!table) return { ok: false, error: `Unsupported entity type: ${recordEntityType}` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [record] = await db
    .select()
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(and(eq((table as any).id, recordId), eq((table as any).tenantId, tenantId)))
    .limit(1);
  if (!record) return { ok: false, error: "Record not found" };

  const kind = field.aiConfig.kind;

  // Long-running "research" enqueues to the Inngest research-agent
  // worker. Returns a jobId immediately; the UI / tool caller polls or
  // subscribes to research-agent/completed events for the final text.
  if (kind === "research") {
    const jobId = `research-${crypto.randomUUID()}`;
    const prompt = field.aiConfig.prompt || `Research this ${recordEntityType} in depth.`;
    try {
      await inngest.send({
        name: "research-agent/run",
        data: {
          tenantId,
          entityType: recordEntityType,
          recordId,
          fieldId,
          prompt,
          jobId,
        },
      });
      return { ok: true, jobId, value: undefined };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to enqueue research job: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const model = pickModel();
  if (!model) return { ok: false, error: "No LLM API key configured" };

  const context = recordToContext(recordEntityType, record as Record<string, unknown>);

  let prompt: string;
  if (kind === "summarize") {
    prompt = `Summarize this ${recordEntityType} in 2-3 sentences. Focus on salient facts.\n\n${context}`;
  } else if (kind === "classify") {
    const options = field.options || [];
    if (options.length === 0) {
      return { ok: false, error: "classify field requires options in the field definition" };
    }
    prompt = `Classify this ${recordEntityType} into exactly one of: ${options.join(", ")}.\nReturn ONLY the chosen option, nothing else.\n\n${context}`;
  } else {
    // prompt
    const p = field.aiConfig.prompt;
    if (!p) return { ok: false, error: "prompt kind requires aiConfig.prompt" };
    // Variable interpolation: {{name}} etc. on the record's top-level keys
    const withVars = p.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const r = record as Record<string, unknown>;
      const v = r[key];
      return v === undefined || v === null ? "" : String(v);
    });
    prompt = `${withVars}\n\nRecord context:\n${context}`;
  }

  try {
    const { text } = await generateText({
      model,
      prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(kind === "classify" ? { temperature: 0 } : {}),
    });
    const value = (text || "").trim();

    // Persist into record.properties.customFields[fieldId]
    const props =
      ((record as Record<string, unknown>).properties as Record<string, unknown>) || {};
    const cfMap =
      ((props.customFields as Record<string, unknown>) || {}) as Record<string, unknown>;
    const nextProps = {
      ...props,
      customFields: { ...cfMap, [fieldId]: value },
    };

    await db
      .update(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ properties: nextProps, updatedAt: new Date() } as any)
      .where(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        and(eq((table as any).id, recordId), eq((table as any).tenantId, tenantId))
      );

    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
