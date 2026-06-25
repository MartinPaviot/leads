/**
 * LLM-based CSV column mapper — extracted from smart import for reuse.
 */

export interface ColumnMapping {
  entityType: "contact" | "account" | "deal" | null;
  fieldMap: Record<string, string>;
  confidence: number;
}

export async function mapColumnsWithAI(
  headers: string[],
  sampleRows: string[][],
  hintEntityType?: string
): Promise<ColumnMapping> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    throw new Error("No LLM key available");
  }

  const prompt = `Map these CSV columns to CRM fields. Return JSON only, no markdown.

CSV Headers: ${JSON.stringify(headers)}
Sample data:
${sampleRows.map((row) => headers.map((h, i) => `${h}: ${row[i] || ""}`).join(", ")).join("\n")}
${hintEntityType ? `User specified entity type: ${hintEntityType}` : ""}

CRM field options:
- Contact fields: firstName, lastName, email, title, phone, linkedinUrl, companyName (for relationship wiring)
- Account fields: name, domain, industry, size, revenue, description
- Deal fields: name, stage (lead/qualification/demo/trial/proposal/negotiation/won/lost), value

Return JSON:
{
  "entityType": "contact" | "account" | "deal",
  "fieldMap": { "CSV Column Name": "crmFieldName", ... },
  "confidence": 0.0-1.0
}

Only map columns you're confident about. Skip ambiguous columns.`;

  const { generateText } = await import("ai");

  if (anthropicKey) {
    const { anthropic } = await import("@/lib/ai/ai-provider");
    const response = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      prompt,
    });
    const text = response.text;
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }

  const { openai } = await import("@ai-sdk/openai");
  const response = await generateText({
    model: openai("gpt-4o-mini"),
    prompt,
  });
  const text = response.text;
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}
