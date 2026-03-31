import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const emailSchema = z.object({
  subject: z.string().describe("Email subject line, concise and compelling"),
  body: z.string().describe("Email body, professional and personalized, 3-5 short paragraphs"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { contactId, context, template } = body;

    if (!contactId || typeof contactId !== "string") {
      return Response.json({ error: "contactId required" }, { status: 400 });
    }

    // Fetch contact
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
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
        .where(eq(companies.id, contact.companyId))
        .limit(1);
      company = c || null;
    }

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    const props = contact.properties as Record<string, unknown> | null;
    const companyProps = company?.properties as Record<string, unknown> | null;
    const signals = (companyProps?.signals as Array<{ type: string; title: string; description: string }>) || [];

    // Build context for LLM
    let prompt = `Write a cold outreach email to this prospect. The email should be professional, concise, and personalized.

PROSPECT:
- Name: ${contactName || "Unknown"}
- Title: ${contact.title || "Unknown"}
- Email: ${contact.email || "Unknown"}
- Seniority: ${(props?.seniority as string) || "Unknown"}`;

    if (company) {
      prompt += `

COMPANY:
- Name: ${company.name}
- Industry: ${company.industry || "Unknown"}
- Size: ${company.size || "Unknown"}
- Revenue: ${company.revenue || "Unknown"}
- Description: ${company.description || "None"}`;
    }

    if (signals.length > 0) {
      prompt += `

BUYING SIGNALS:
${signals.map((s) => `- ${s.type}: ${s.title} — ${s.description}`).join("\n")}`;
    }

    if (context) {
      prompt += `

ADDITIONAL CONTEXT:
${context}`;
    }

    if (template) {
      prompt += `

Use this template as a base, but personalize it:
Subject: ${template.subject}
Body: ${template.body}`;
    }

    prompt += `

RULES:
- Keep the subject under 60 characters
- Keep the body under 200 words
- Reference at least one specific detail about the prospect or their company
- If there are buying signals, reference the most relevant one
- End with a clear, low-commitment CTA (e.g. "Worth a quick chat?" not "Book a demo now")
- Do NOT use generic phrases like "I came across your profile" or "I hope this email finds you well"
- Write in a natural, founder-to-founder tone`;

    const { object } = await generateObject({
      model,
      schema: emailSchema,
      prompt,
    });

    // Substitute template variables if present
    let subject = object.subject;
    let emailBody = object.body;

    const vars: Record<string, string> = {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      fullName: contactName,
      title: contact.title || "",
      company: company?.name || "",
      industry: company?.industry || "",
      senderName: session.user.name || "Me",
      senderCompany: "LeadSens",
    };

    for (const [key, value] of Object.entries(vars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      subject = subject.replace(pattern, value);
      emailBody = emailBody.replace(pattern, value);
    }

    return Response.json({
      subject,
      body: emailBody,
      metadata: { model: "claude-sonnet" },
    });
  } catch (error) {
    console.error("Email generation failed:", error);
    return Response.json({ error: "Email generation failed" }, { status: 500 });
  }
}
