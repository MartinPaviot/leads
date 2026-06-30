import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const followUpSchema = z.object({
  subject: z.string().describe("Follow-up email subject line"),
  body: z.string().describe("Follow-up email body, professional and concise"),
  actionItems: z.array(z.string()).describe("Action items extracted from the context"),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { contactId, context } = body;

    if (!contactId || typeof contactId !== "string") {
      return Response.json({ error: "contactId required" }, { status: 400 });
    }

    if (!context || typeof context !== "string") {
      return Response.json({ error: "context required" }, { status: 400 });
    }

    // Fetch contact
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
      .limit(1);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    // Fetch company if available
    let company = null;
    if (contact.companyId) {
      const [c] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
        .limit(1);
      company = c || null;
    }

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

    const prompt = `Write a follow-up email based on the meeting notes or last interaction summary below.
Extract specific action items from the context and reference them in the email.

RECIPIENT:
- Name: ${contactName || "Unknown"}
- Title: ${contact.title || "Unknown"}
- Email: ${contact.email || "Unknown"}
${company ? `- Company: ${company.name}` : ""}

MEETING NOTES / LAST INTERACTION:
${context}

RULES:
- Extract all action items mentioned or implied in the context
- Reference specific discussion points from the meeting
- Keep the tone professional but warm
- Include a clear summary of agreed next steps
- Keep the email concise (under 250 words)
- End with a specific call-to-action tied to the next steps`;

    const { object } = await tracedGenerateObject({
      model,
      schema: followUpSchema,
      prompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      _trace: { agentId: "follow-up-email", tenantId: authCtx.tenantId, contactId, companyId: contact.companyId ?? undefined },
    });
    const result = object as any;

    return Response.json({
      subject: result.subject,
      body: result.body,
      actionItems: result.actionItems,
    });
  } catch (error) {
    console.error("Follow-up email generation failed:", error);
    return Response.json({ error: "Follow-up email generation failed" }, { status: 500 });
  }
}
