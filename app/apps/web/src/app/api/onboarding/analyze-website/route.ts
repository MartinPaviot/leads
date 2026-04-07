import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropic } from "@ai-sdk/anthropic";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import { INDUSTRIES, industriesPromptHint, companySizesPromptHint } from "@/lib/icp-constants";

// Step 1: Extract structured intelligence from the website
const websiteIntelligenceSchema = z.object({
  companyDescription: z.string().describe("One-sentence description of what this company does"),
  productDescription: z.string().describe("What the company sells, in plain language. Return empty string if unclear — never placeholders."),
  pricingModel: z.enum(["self_serve", "sales_led", "hybrid", "unknown"]).describe("How they sell: self-serve (free trial/signup), sales-led (book demo/contact sales), or hybrid"),
  targetMarketSignals: z.array(z.string()).describe("Direct evidence of who they target: customer logos, testimonials, case studies, pricing tiers, language used"),
  competitorClues: z.array(z.string()).describe("Any competitors or alternatives mentioned or implied"),
  maturitySignals: z.array(z.string()).describe("Signs of company maturity: team size mentions, office locations, funding announcements, compliance badges"),
});

// Step 2: Infer ICP with confidence gaps
const icpInferenceSchema = z.object({
  targetIndustries: z.array(z.string()).describe(`Industries this company likely sells to. ${industriesPromptHint()}`),
  targetCompanySizes: z.array(z.string()).describe(`Company sizes they likely target. ${companySizesPromptHint()}`),
  targetRoles: z.string().describe("Job titles/roles of the typical buyer (e.g. 'VP Engineering, CTO, Head of Product')"),
  targetGeographies: z.array(z.string()).describe("Geographic locations they likely target. Use specific names: country, state, or city (e.g. 'United States', 'France', 'California'). Be precise."),
  suggestedTone: z.enum(["Formal", "Direct", "Casual"]).describe("Suggested email tone based on brand voice"),
  confidence: z.number().describe("Overall confidence in the ICP inference, between 0.0 and 1.0"),
  reasoning: z.string().describe("2-3 sentence explanation of the evidence that drove these ICP parameters"),
  confidenceGaps: z.array(z.object({
    field: z.string().describe("Which ICP field has low confidence"),
    question: z.string().describe("A specific question to ask the founder to fill this gap"),
    currentGuess: z.string().describe("What we inferred, so the founder can correct it"),
  })).describe("Fields where confidence is below 0.7 — the UI will ask the founder these questions"),
});

async function scrapeWebsite(domain: string): Promise<string | null> {
  const urls = [`https://${domain}`, `https://www.${domain}`];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Elevay/1.0; +https://elevay.com)",
          "Accept": "text/html",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!res.ok) continue;

      const html = await res.text();

      // Extract useful content without a DOM parser
      const extract = (pattern: RegExp): string => {
        const match = html.match(pattern);
        return match?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
      };

      const title = extract(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const metaDesc = extract(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
        || extract(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
      const ogDesc = extract(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
      const ogTitle = extract(/<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i);

      // Extract all H1 and H2 tags
      const headings: string[] = [];
      const headingRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
      let hMatch;
      while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
        const text = hMatch[1].replace(/<[^>]*>/g, "").trim();
        if (text.length > 3 && text.length < 200) headings.push(text);
      }

      // Extract visible text from body (stripped of scripts/styles, limited)
      let bodyText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Limit body text to avoid token waste
      bodyText = bodyText.slice(0, 3000);

      // Look for pricing indicators
      const hasPricing = /pricing|plans|per\s*month|\$\d|€\d|contact\s*sales|book\s*a?\s*demo/i.test(html);
      const hasEnterprise = /enterprise|contact\s*sales|talk\s*to\s*(sales|us)|book\s*a?\s*demo/i.test(html);
      const hasSelfServe = /sign\s*up\s*free|free\s*trial|get\s*started\s*free|start\s*free/i.test(html);

      // Look for customer logos (alt text often reveals customer names)
      const logoAlts: string[] = [];
      const imgRegex = /alt=["']([\s\S]*?)["']/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null && logoAlts.length < 20) {
        const alt = imgMatch[1].trim();
        if (alt.length > 2 && alt.length < 50 && !/icon|logo|arrow|menu|close|image/i.test(alt)) {
          logoAlts.push(alt);
        }
      }

      const content = [
        `URL: ${url}`,
        title && `Title: ${title}`,
        metaDesc && `Meta description: ${metaDesc}`,
        ogDesc && ogDesc !== metaDesc && `OG description: ${ogDesc}`,
        ogTitle && ogTitle !== title && `OG title: ${ogTitle}`,
        headings.length > 0 && `Headings: ${headings.join(" | ")}`,
        hasPricing && `Pricing signals: ${hasEnterprise ? "enterprise/sales-led" : ""} ${hasSelfServe ? "self-serve/free-trial" : ""}`.trim(),
        logoAlts.length > 0 && `Image alt texts (possible customer logos): ${logoAlts.join(", ")}`,
        bodyText && `Page content (excerpt): ${bodyText}`,
      ].filter(Boolean).join("\n");

      return content;
    } catch {
      continue;
    }
  }

  return null;
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const body = await req.json();
  const { domain, productDescription } = body;

  if (!domain) {
    return Response.json({ error: "Domain required" }, { status: 400 });
  }

  // Clean domain
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "").trim();

  // Scrape website
  const websiteContent = await scrapeWebsite(cleanDomain);

  try {
    // ── Step 1: Extract structured intelligence from the website ──
    const intelligencePrompt = [
      `Extract structured intelligence from this company's website. Be precise — only report what you can directly observe.`,
      ``,
      `Company domain: ${cleanDomain}`,
      productDescription ? `Product description (from founder): ${productDescription}` : "",
      ``,
      websiteContent
        ? `Website content:\n${websiteContent}`
        : `Could not scrape website. Extract what you can from the domain name and product description only.`,
      ``,
      `<few_shot_examples>`,
      `<example>`,
      `Domain: notion.so — PLG SaaS, self-serve signup, team collaboration. Targets: knowledge workers, startups to enterprise.`,
      `Pricing model: hybrid (free tier + sales-led enterprise). Customer logos: Toyota, Figma, Pixar = enterprise social proof.`,
      `</example>`,
      `<example>`,
      `Domain: gong.io — Sales-led, "book a demo" CTA, revenue intelligence platform.`,
      `Pricing model: sales_led. Customer logos: LinkedIn, Hubspot = mid-market/enterprise B2B SaaS.`,
      `</example>`,
      `<example>`,
      `Domain: lemlist.com — Self-serve cold outreach tool, free trial CTA.`,
      `Pricing model: self_serve. Targets: SDRs, sales teams at SMBs. No enterprise logos.`,
      `</example>`,
      `</few_shot_examples>`,
    ].filter(Boolean).join("\n");

    const { object: intelligence } = await tracedGenerateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: websiteIntelligenceSchema,
      prompt: intelligencePrompt,
      _trace: { agentId: "icp-analysis", tenantId: authCtx.tenantId, inputPreview: `Step 1: Extract intelligence from ${cleanDomain}` },
    });

    // ── Step 2: Infer ICP from the extracted intelligence ──
    const icpPrompt = `You are an expert GTM strategist. Based on the structured intelligence below, infer this company's ideal customer profile (ICP) — who they should be selling to.

COMPANY: ${cleanDomain}
${productDescription ? `FOUNDER'S DESCRIPTION: ${productDescription}` : ""}

EXTRACTED INTELLIGENCE:
- What they do: ${(intelligence as any).companyDescription}
- What they sell: ${(intelligence as any).productDescription}
- Pricing model: ${(intelligence as any).pricingModel}
- Target market signals: ${(intelligence as any).targetMarketSignals.join("; ")}
- Competitor clues: ${(intelligence as any).competitorClues.join("; ") || "none detected"}
- Maturity signals: ${(intelligence as any).maturitySignals.join("; ") || "none detected"}

INFERENCE RULES:
- self_serve pricing → include SMB sizes (1-10, 11-50). sales_led → include mid-market/enterprise (51-200, 201-500, 501-1000+).
- If customer logos include Fortune 500 companies → enterprise target.
- If the product is technical (APIs, dev tools) → target technical buyers (CTO, VP Eng, developers).
- If the product is business-focused (CRM, marketing) → target business buyers (VP Sales, CMO, RevOps).
- Be SPECIFIC with geographies: if the website is in English with US pricing → "United States". If multi-language → list specific countries.
- For each ICP dimension where you're less than 70% confident, add a confidenceGap with a specific question for the founder.

Think step by step about what the evidence tells you, then produce your inference.`;

    const { object: icpResult } = await tracedGenerateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: icpInferenceSchema,
      prompt: icpPrompt,
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 4000 },
        },
      },
      _trace: { agentId: "icp-analysis", tenantId: authCtx.tenantId, inputPreview: `Step 2: Infer ICP for ${cleanDomain}` },
    });

    return Response.json({
      ...(icpResult as any),
      companyDescription: (intelligence as any).companyDescription,
      productDescription: (intelligence as any).productDescription || productDescription || "",
      domain: cleanDomain,
      hadWebsiteContent: !!websiteContent,
      pricingModel: (intelligence as any).pricingModel,
    });
  } catch (error) {
    console.error("Website analysis failed:", error);
    return Response.json({
      error: "Analysis failed",
      domain: cleanDomain,
      hadWebsiteContent: !!websiteContent,
    }, { status: 500 });
  }
}
