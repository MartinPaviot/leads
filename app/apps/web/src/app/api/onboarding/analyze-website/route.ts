import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropic } from "@ai-sdk/anthropic";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import { INDUSTRIES, industriesPromptHint, companySizesPromptHint } from "@/lib/icp-constants";

const icpInferenceSchema = z.object({
  companyDescription: z.string().describe("One-sentence description of what this company does"),
  productDescription: z.string().describe("What the company sells, in plain language. Return an empty string if you cannot determine this — never return placeholders like 'unknown' or 'N/A'."),
  targetIndustries: z.array(z.string()).describe(`Industries this company likely sells to. ${industriesPromptHint()}`),
  targetCompanySizes: z.array(z.string()).describe(`Company sizes they likely target. ${companySizesPromptHint()}`),
  targetRoles: z.string().describe("Job titles/roles of the typical buyer (e.g. 'VP Engineering, CTO, Head of Product')"),
  targetGeographies: z.array(z.string()).describe("Geographic locations they likely target. Use specific names: country, state, or city (e.g. 'United States', 'France', 'California'). Be precise."),
  suggestedTone: z.string().describe("Suggested email tone: 'Formal', 'Direct', or 'Casual'"),
  confidence: z.number().describe("Confidence score in the ICP inference, between 0.0 and 1.0"),
  reasoning: z.string().describe("Brief explanation of why these ICP parameters were chosen"),
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

  const prompt = [
    `Analyze this company and infer their ideal customer profile (ICP) — who they should be selling to.`,
    ``,
    `Company domain: ${cleanDomain}`,
    productDescription ? `Product description (from founder): ${productDescription}` : "",
    ``,
    websiteContent
      ? `Website content:\n${websiteContent}`
      : `Could not scrape website. Infer ICP from the domain name and product description only.`,
    ``,
    `Based on ALL available signals (what they sell, their pricing model, their existing customers, their market positioning), infer who their ideal customer is.`,
    `Be specific: pick exact industries, company sizes, buyer roles, and geographies.`,
    `If the website shows customer logos or testimonials, use those to validate the ICP.`,
    `If the website has "contact sales" or "book a demo", the target is likely mid-market/enterprise.`,
    `If the website has "sign up free" or "free trial", the target likely includes SMBs.`,
  ].filter(Boolean).join("\n");

  try {
    const { object } = await tracedGenerateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: icpInferenceSchema,
      prompt,
      _trace: { agentId: "icp-analysis", tenantId: authCtx.tenantId },
    });
    const result = object as any;

    return Response.json({
      ...result,
      domain: cleanDomain,
      hadWebsiteContent: !!websiteContent,
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
