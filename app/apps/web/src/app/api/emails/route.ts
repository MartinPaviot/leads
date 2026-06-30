import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { getWritingSamples, buildWritingStylePrompt } from "@/lib/writing-profile";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const emailSchema = z.object({
  subject: z.string().describe("Email subject line, concise and compelling"),
  body: z.string().describe("Email body, professional and personalized, 3-5 short paragraphs"),
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
    const { contactId, context, template } = body;

    if (!contactId || typeof contactId !== "string") {
      return Response.json({ error: "contactId required" }, { status: 400 });
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
    const props = contact.properties as Record<string, unknown> | null;
    const companyProps = company?.properties as Record<string, unknown> | null;
    const signals = (companyProps?.signals as Array<{ type: string; title: string; description: string }>) || [];

    // Load tenant settings + writing samples in parallel
    const [settings, writingSamples] = await Promise.all([
      getTenantSettings(authCtx.tenantId),
      getWritingSamples(authCtx.tenantId),
    ]);
    const senderCompanyName = settings.onboardingCompanyName || "";
    const senderFullName = settings.onboardingFullName || "";
    const productDesc = settings.productDescription || "";

    // Build context for LLM
    let prompt = `Write a cold outreach email to this prospect. The email should be concise and personalized.

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

    if (productDesc) {
      prompt += `

SENDER CONTEXT:
- Company: ${senderCompanyName}
- What we sell: ${productDesc}${senderFullName ? `\n- Sender name: ${senderFullName}` : ""}`;
    }

    // Inject real writing samples as style reference (few-shot)
    const writingStyleSection = buildWritingStylePrompt(writingSamples);

    if (senderFullName) {
      let signature = senderFullName;
      if (settings.onboardingRole) signature += `\n${settings.onboardingRole}`;
      if (senderCompanyName) signature += ` @ ${senderCompanyName}`;
      prompt += `

SIGNATURE (append this to every email):
${signature}`;
    }

    prompt += `
${writingStyleSection}
RULES:
- Keep the subject under 60 characters
- Keep the body under 200 words
- Reference at least one specific detail about the prospect or their company
- If there are buying signals, reference the most relevant one
- End with a clear, low-commitment CTA (e.g. "Worth a quick chat?" not "Book a demo now")
- Do NOT use generic phrases like "I came across your profile" or "I hope this email finds you well"${!writingStyleSection ? "\n- Write in a direct, concise tone" : ""}`;

    const { object } = await tracedGenerateObject({
      model,
      schema: emailSchema,
      prompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      _trace: { agentId: "draft-email", tenantId: authCtx.tenantId, contactId, companyId: company?.id, inputPreview: `Draft email for ${contactName} at ${company?.name || "unknown"}` },
    });
    const result = object as any;

    // Substitute template variables if present
    let subject = result.subject;
    let emailBody = result.body;

    const vars: Record<string, string> = {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      fullName: contactName,
      title: contact.title || "",
      company: company?.name || "",
      industry: company?.industry || "",
      senderName: senderFullName || "Me",
      senderCompany: senderCompanyName,
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
