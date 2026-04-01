import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searchPeople, enrichPerson, isApolloAvailable } from "@/lib/apollo-client";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const llmFallbackSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      reason: z.string(),
    })
  ),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!company) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Try Apollo first
  if (isApolloAvailable() && company.domain) {
    try {
      const result = await searchPeople({
        q_organization_domains: company.domain,
        person_seniorities: ["c_suite", "vp", "director", "manager", "founder", "owner"],
        per_page: 10,
      });

      const suggestions = result.people.map((p) => ({
        name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
        title: p.title || "Unknown",
        email: p.email || null,
        linkedinUrl: p.linkedin_url || null,
        seniority: p.seniority || null,
        departments: p.departments || [],
        city: p.city || null,
        country: p.country || null,
        apolloId: p.id,
        source: "apollo",
        reason: `${p.seniority || "Senior"} ${p.title || "leader"} at ${company.name} — likely involved in purchasing decisions`,
      }));

      return Response.json({ suggestions, source: "apollo" });
    } catch (err) {
      console.warn("Apollo people search failed:", err);
    }
  }

  // LLM fallback
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ suggestions: [], source: "none" });
  }

  try {
    const { object } = await generateObject({
      model,
      schema: llmFallbackSchema,
      prompt: `Suggest 3-5 key decision-maker contacts to reach out to at ${company.name} (${company.domain || "unknown domain"}, ${company.industry || "unknown industry"}, ${company.size || "unknown size"}).

Focus on C-suite, VP-level, Directors. Generate realistic titles and roles but note these are estimated, not verified contacts.`,
    });

    const suggestions = object.suggestions.map((s) => ({
      ...s,
      source: "llm_fallback",
      email: null,
      linkedinUrl: null,
    }));

    return Response.json({ suggestions, source: "llm_fallback" });
  } catch {
    return Response.json({ suggestions: [], source: "error" });
  }
}
