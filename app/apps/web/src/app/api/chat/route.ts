import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { searchSimilar } from "@/lib/embeddings";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 30;

async function getEntityContext(contextType?: string, contextId?: string): Promise<string> {
  if (!contextType || !contextId) return "";
  try {
    if (contextType === "account" || contextType === "company") {
      const [company] = await db.select().from(companies).where(eq(companies.id, contextId)).limit(1);
      if (company) {
        return `\n\n## Current Context: Account "${company.name}"\nDomain: ${company.domain || "unknown"}\nIndustry: ${company.industry || "unknown"}\nSize: ${company.size || "unknown"}\nRevenue: ${company.revenue || "unknown"}\nDescription: ${company.description || "none"}\n\nAll questions should be answered in the context of this account. Focus on information relevant to ${company.name}.`;
      }
    }
    if (contextType === "contact") {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contextId)).limit(1);
      if (contact) {
        const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
        return `\n\n## Current Context: Contact "${contactName}"\nEmail: ${contact.email || "unknown"}\nTitle: ${contact.title || "unknown"}\nCompany ID: ${contact.companyId || "unknown"}\n\nAll questions should be answered in the context of this contact.`;
      }
    }
    if (contextType === "deal") {
      const [deal] = await db.select().from(deals).where(eq(deals.id, contextId)).limit(1);
      if (deal) {
        return `\n\n## Current Context: Deal "${deal.name}"\nStage: ${deal.stage}\nValue: ${deal.value ? "$" + deal.value.toLocaleString() : "not set"}\nSummary: ${deal.summary || "none"}\n\nAll questions should be answered in the context of this deal.`;
      }
    }
  } catch {
    // Non-critical
  }
  return "";
}

export async function POST(req: Request) {
  const { messages, contextType, contextId }: { messages: UIMessage[]; contextType?: string; contextId?: string } = await req.json();

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return new Response(
      "Connect an LLM API key in .env.local for AI capabilities.",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // Extract last user message text for RAG (UIMessage uses parts array)
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const lastUserText = lastUserMessage?.parts
    ?.filter((p) => p.type === "text")
    .map((p) => ("text" in p ? p.text : ""))
    .join("") || "";
  let ragContext = "";

  if (lastUserText && process.env.OPENAI_API_KEY) {
    try {
      const results = await searchSimilar(lastUserText, 5);
      if (results.length > 0) {
        ragContext =
          "\n\n## Relevant CRM Data\n" +
          results
            .filter((r) => r.similarity > 0.3)
            .map(
              (r) =>
                `[${r.entityType}] ${r.content} (relevance: ${(r.similarity * 100).toFixed(0)}%)`
            )
            .join("\n");
      }
    } catch (err) {
      console.warn("RAG search failed:", err);
      // Continue without RAG context
    }
  }

  const result = streamText({
    model,
    system: `You are LeadSens, an autonomous GTM engine for early-stage founders doing founder-led sales. You help with:
- Managing accounts, contacts, and deals
- Answering questions about the pipeline
- Drafting follow-up emails
- Providing sales coaching and deal insights
- Creating and managing tasks

Be concise, specific, and actionable. When referencing CRM data, cite the specific record.
If you don't have data, say so honestly.

IMPORTANT: Always respond in the same language as the user's message. If the user writes in French, respond entirely in French including any table headers or labels. If in Spanish, respond in Spanish. Default to English.${ragContext}${await getEntityContext(contextType, contextId)}`,
    messages: await convertToModelMessages(messages),
  });

  return result.toTextStreamResponse();
}
