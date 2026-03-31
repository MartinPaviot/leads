import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const contactScoreSchema = z.object({
  score: z.number().min(0).max(100).describe("Contact priority score 0-100"),
  reasons: z.array(z.string()).describe("2-3 reasons for the score"),
  grade: z.enum(["A", "B", "C", "D", "F"]).describe("Letter grade"),
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
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json({ error: "contactIds array required" }, { status: 400 });
    }

    let scored = 0;

    for (const id of contactIds.slice(0, 20)) {
      try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, id))
          .limit(1);

        if (!contact) continue;

        // Get company info if available
        let companyInfo = "";
        if (contact.companyId) {
          const [company] = await db
            .select()
            .from(companies)
            .where(eq(companies.id, contact.companyId))
            .limit(1);
          if (company) {
            companyInfo = `Company: ${company.name}, Industry: ${company.industry || "unknown"}, Size: ${company.size || "unknown"}, Score: ${company.score ?? "unscored"}`;
          }
        }

        const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
        const props = contact.properties as Record<string, unknown> | null;

        const { object } = await generateObject({
          model,
          schema: contactScoreSchema,
          prompt: `Score this contact as a sales prospect on a scale of 0-100.

Name: ${name || "unknown"}
Title: ${contact.title || "unknown"}
Email: ${contact.email || "unknown"}
Seniority: ${(props?.seniority as string) || "unknown"}
Department: ${(props?.department as string) || "unknown"}
${companyInfo}

Score higher for: decision makers (C-Suite, VP, Director), relevant departments (Engineering, Product for B2B SaaS), contacts at high-scoring companies.
Score lower for: junior roles, irrelevant departments, no company association.`,
        });

        await db
          .update(contacts)
          .set({
            score: object.score,
            scoreReasons: object.reasons,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, id));

        scored++;
      } catch (err) {
        console.warn(`Failed to score contact ${id}:`, err);
      }
    }

    return Response.json({ success: true, scored });
  } catch (error) {
    console.error("Contact scoring failed:", error);
    return Response.json({ error: "Contact scoring failed" }, { status: 500 });
  }
}
