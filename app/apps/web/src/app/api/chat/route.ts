import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { searchSimilar } from "@/lib/embeddings";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

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

  // RAG: Get relevant context from embeddings
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");
  let ragContext = "";

  if (lastUserMessage?.content && process.env.OPENAI_API_KEY) {
    try {
      const results = await searchSimilar(lastUserMessage.content, 5);
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
If you don't have data, say so honestly.${ragContext}`,
    messages,
  });

  return result.toTextStreamResponse();
}
