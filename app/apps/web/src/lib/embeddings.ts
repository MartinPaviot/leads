import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}

export async function embedEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
  content: string
): Promise<void> {
  if (!content.trim()) return;

  // Truncate to ~6000 chars (~1500 tokens) to stay within limits
  const truncated = content.slice(0, 6000);
  const vector = await embedText(truncated);
  const vectorStr = `[${vector.join(",")}]`;

  await sql`
    INSERT INTO embeddings (tenant_id, entity_type, entity_id, content, embedding)
    VALUES (${tenantId}, ${entityType}, ${entityId}, ${truncated}, ${vectorStr}::vector)
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET content = ${truncated}, embedding = ${vectorStr}::vector, created_at = NOW()
  `;
}

export async function searchSimilar(
  query: string,
  limit: number = 5,
  tenantId?: string
): Promise<
  Array<{
    entityType: string;
    entityId: string;
    content: string;
    similarity: number;
  }>
> {
  const queryVector = await embedText(query);
  const vectorStr = `[${queryVector.join(",")}]`;

  const results = tenantId
    ? await sql`
        SELECT
          entity_type,
          entity_id,
          content,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM embeddings
        WHERE tenant_id = ${tenantId}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          entity_type,
          entity_id,
          content,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM embeddings
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;

  return results.map((r) => ({
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    content: r.content as string,
    similarity: r.similarity as number,
  }));
}

export function contactToText(contact: {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  properties?: Record<string, unknown> | null;
  companyName?: string | null;
}): string {
  const parts = [];
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  if (name) parts.push(name);
  if (contact.title) parts.push(contact.title);
  if (contact.companyName) parts.push(`at ${contact.companyName}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.phone) parts.push(`Phone: ${contact.phone}`);
  const notes = (contact.properties as Record<string, string>)?.notes;
  if (notes) parts.push(`Notes: ${notes}`);
  return parts.join(". ");
}

export function activityToText(activity: {
  activityType: string;
  summary?: string | null;
  rawContent?: string | null;
  channel?: string | null;
  direction?: string | null;
  occurredAt?: Date | null;
  contactName?: string | null;
  companyName?: string | null;
}): string {
  const parts = [];
  if (activity.activityType) parts.push(activity.activityType.replace(/_/g, " "));
  if (activity.contactName) parts.push(`with ${activity.contactName}`);
  if (activity.companyName) parts.push(`at ${activity.companyName}`);
  if (activity.summary) parts.push(activity.summary);
  if (activity.occurredAt) parts.push(`on ${activity.occurredAt.toISOString().split("T")[0]}`);
  if (activity.rawContent) parts.push(activity.rawContent.slice(0, 2000));
  return parts.join(". ");
}

export function companyToText(company: {
  name: string;
  domain?: string | null;
  industry?: string | null;
  revenue?: string | null;
  size?: string | null;
  description?: string | null;
}): string {
  const parts = [company.name];
  if (company.domain) parts.push(`Domain: ${company.domain}`);
  if (company.industry) parts.push(`Industry: ${company.industry}`);
  if (company.revenue) parts.push(`Revenue: ${company.revenue}`);
  if (company.size) parts.push(`Size: ${company.size}`);
  if (company.description) parts.push(company.description);
  return parts.join(". ");
}
