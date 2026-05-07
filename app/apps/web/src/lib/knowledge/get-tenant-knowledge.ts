import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface TenantKnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  category: string;
}

/**
 * Single read path for tenant Knowledge. All code that needs Knowledge
 * entries should call this instead of reading settings.knowledge.
 *
 * Reads from knowledge_entries table (primary) with fallback to
 * settings.knowledge JSONB (legacy, for tenants that haven't migrated).
 */
export async function getTenantKnowledge(
  tenantId: string,
  options?: { limit?: number },
): Promise<TenantKnowledgeEntry[]> {
  const limit = options?.limit ?? 20;

  try {
    const rows = await db
      .select({
        id: knowledgeEntries.id,
        title: knowledgeEntries.title,
        content: knowledgeEntries.content,
        category: knowledgeEntries.category,
      })
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.tenantId, tenantId),
          eq(knowledgeEntries.isActive, true),
          eq(knowledgeEntries.scope, "workspace"),
        ),
      )
      .orderBy(desc(knowledgeEntries.updatedAt))
      .limit(limit);

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        topic: r.title,
        content: r.content,
        category: r.category,
      }));
    }
  } catch {
    // Table may not exist yet — fall through to legacy
  }

  // Legacy fallback: read from settings.knowledge JSONB
  try {
    const { getTenantSettings } = await import("@/lib/config/tenant-settings");
    const settings = await getTenantSettings(tenantId);
    const legacy = (settings.knowledge || []) as Array<{ id?: string; topic: string; content: string }>;
    return legacy.map((k) => ({
      id: k.id ?? "",
      topic: k.topic,
      content: k.content,
      category: "custom",
    }));
  } catch {
    return [];
  }
}

/**
 * Format Knowledge entries as a text block for LLM prompts.
 */
export function formatKnowledgeBlock(entries: TenantKnowledgeEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map((k) => `- ${k.topic}: ${k.content}`).join("\n");
}
