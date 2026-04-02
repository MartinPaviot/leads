import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts, deals, activities, tenants } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { CustomFieldDef } from "@/lib/custom-fields";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-20250514");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

/**
 * S3: AI auto-fill for custom fields.
 *
 * Triggered after activity creation (email sync, transcript processing, etc.).
 * Reads custom field definitions with aiFillMode = "auto" and fills them
 * from conversation data + enrichment.
 *
 * Also generates account summaries ("Account summary" and "About their business").
 */
export const aiAutoFill = inngest.createFunction(
  {
    id: "ai-autofill-fields",
    name: "AI Auto-Fill Custom Fields",
    retries: 1,
    concurrency: [{ limit: 2, key: "event.data.tenantId" }],
    triggers: [{ event: "entity/auto-fill-requested" }],
  },
  async ({ event, step }) => {
    const { tenantId, entityType, entityId } = event.data as {
      tenantId: string;
      entityType: "company" | "contact" | "deal";
      entityId: string;
    };

    const model = getLLMModel();
    if (!model) return { skipped: true, reason: "No LLM configured" };

    // Load custom field definitions
    const fieldDefs = await step.run("load-field-defs", async () => {
      const [tenant] = await db.select().from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) return [];
      const settings = (tenant.settings || {}) as Record<string, unknown>;
      const allFields = (settings.customFields || []) as CustomFieldDef[];
      return allFields.filter((f) => f.entityType === entityType && f.aiFillMode === "auto");
    });

    if (fieldDefs.length === 0) return { skipped: true, reason: "No auto-fill fields defined" };

    // Load entity data + recent activities
    const context = await step.run("load-context", async () => {
      let entity: Record<string, unknown> = {};
      let entityActivities: Array<{ summary: string | null; rawContent: string | null; occurredAt: Date | string | null }> = [];

      if (entityType === "company") {
        const [company] = await db.select().from(companies)
          .where(and(eq(companies.id, entityId), eq(companies.tenantId, tenantId))).limit(1);
        if (company) entity = { name: company.name, domain: company.domain, industry: company.industry, size: company.size, revenue: company.revenue, description: company.description };
        entityActivities = await db.select({ summary: activities.summary, rawContent: activities.rawContent, occurredAt: activities.occurredAt })
          .from(activities)
          .where(and(eq(activities.entityType, "company"), eq(activities.entityId, entityId), eq(activities.tenantId, tenantId)))
          .orderBy(desc(activities.occurredAt)).limit(20);
      } else if (entityType === "contact") {
        const [contact] = await db.select().from(contacts)
          .where(and(eq(contacts.id, entityId), eq(contacts.tenantId, tenantId))).limit(1);
        if (contact) entity = { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, title: contact.title };
        entityActivities = await db.select({ summary: activities.summary, rawContent: activities.rawContent, occurredAt: activities.occurredAt })
          .from(activities)
          .where(and(eq(activities.entityType, "contact"), eq(activities.entityId, entityId), eq(activities.tenantId, tenantId)))
          .orderBy(desc(activities.occurredAt)).limit(20);
      } else if (entityType === "deal") {
        const [deal] = await db.select().from(deals)
          .where(and(eq(deals.id, entityId), eq(deals.tenantId, tenantId))).limit(1);
        if (deal) entity = { name: deal.name, stage: deal.stage, value: deal.value, summary: deal.summary };
        entityActivities = await db.select({ summary: activities.summary, rawContent: activities.rawContent, occurredAt: activities.occurredAt })
          .from(activities)
          .where(and(eq(activities.entityType, "deal"), eq(activities.entityId, entityId), eq(activities.tenantId, tenantId)))
          .orderBy(desc(activities.occurredAt)).limit(20);
      }

      return { entity, activities: entityActivities };
    });

    if (!context.entity || Object.keys(context.entity).length === 0) {
      return { skipped: true, reason: "Entity not found" };
    }

    // Build prompt for AI to fill fields
    const result = await step.run("ai-fill", async () => {
      const fieldsToFill = fieldDefs.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        options: f.options,
      }));

      const activityContext = context.activities
        .filter((a) => a.summary || a.rawContent)
        .map((a) => `${a.occurredAt ? new Date(a.occurredAt).toISOString().split("T")[0] : "?"}: ${a.summary || ""} ${a.rawContent?.slice(0, 300) || ""}`)
        .join("\n");

      const { text } = await generateText({
        model,
        system: `You extract structured data from CRM entity information and conversations.
Return ONLY valid JSON: an object where keys are field IDs and values are the extracted values.
For select fields, use only the provided options. For date fields, use ISO format (YYYY-MM-DD).
If you cannot determine a value from the available data, omit the key entirely.
Do NOT guess or hallucinate — only extract what's clearly stated.`,
        prompt: `Entity (${entityType}):
${JSON.stringify(context.entity, null, 2)}

Recent conversations/activities:
${activityContext || "No activities recorded"}

Fields to fill:
${JSON.stringify(fieldsToFill, null, 2)}

Extract values for these fields from the entity data and conversation history. Return a JSON object with field IDs as keys.`,
        // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
        maxTokens: 500,
      });

      try {
        return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
      } catch {
        return {};
      }
    });

    if (Object.keys(result).length === 0) {
      return { filled: 0, reason: "No values extracted" };
    }

    // Update entity properties with filled values
    await step.run("save-filled-values", async () => {
      const table = entityType === "company" ? companies : entityType === "contact" ? contacts : deals;
      const idCol = entityType === "company" ? companies.id : entityType === "contact" ? contacts.id : deals.id;
      const tenantCol = entityType === "company" ? companies.tenantId : entityType === "contact" ? contacts.tenantId : deals.tenantId;

      const [current] = await db.select().from(table)
        .where(and(eq(idCol, entityId), eq(tenantCol, tenantId))).limit(1);

      if (current) {
        const currentProps = ((current as any).properties || {}) as Record<string, unknown>;
        const currentCustom = (currentProps.customFields || {}) as Record<string, unknown>;

        await db.update(table).set({
          properties: {
            ...currentProps,
            customFields: { ...currentCustom, ...result },
            lastAutoFilled: new Date().toISOString(),
          },
          updatedAt: new Date(),
        } as any).where(and(eq(idCol, entityId), eq(tenantCol, tenantId)));
      }
    });

    return { filled: Object.keys(result).length, fields: result };
  }
);
