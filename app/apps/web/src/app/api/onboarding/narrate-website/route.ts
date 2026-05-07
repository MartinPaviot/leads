import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedStreamText } from "@/lib/ai/traced-ai";
import { assertPublicUrl } from "@/lib/infra/ssrf-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/onboarding/narrate-website
 *
 * Streams a short, first-person narrative of what the LLM
 * understands about the user's company from its website. Displayed
 * during the onboarding wizard as a "live thinking" card so the
 * founder sees the agent form an opinion on their business in real
 * time — the first wow effect of onboarding.
 *
 * Deliberately separate from `/api/onboarding/analyze-website`
 * (which runs a structured ICP extraction in parallel). Keeping the
 * narrative stream and the structured inference as independent
 * endpoints means:
 *   - The narrative text can be fully streaming (cheap token-level
 *     animation) without blocking the ICP fields from arriving.
 *   - The structured extractor keeps its strict zod schema; it
 *     doesn't have to double as a friendly copy writer.
 *
 * The endpoint re-scrapes the website — duplicate with the
 * structured analyzer, but intentional: each request is stateless
 * and must succeed on its own if the sibling request fails or races.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rl = await checkRateLimit("llm", authCtx.userId);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as {
    domain?: string;
  };

  const domainRaw = body.domain?.trim();
  if (!domainRaw) {
    return new Response("domain required", { status: 400 });
  }

  const cleanDomain = domainRaw
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .replace(/\/.*$/, "")
    .trim();

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return new Response("No LLM configured", { status: 500 });
  }

  const websiteContent = await scrapeWebsite(cleanDomain);

  const prompt = `You are an experienced founder-led sales advisor who just read a new user's website for the first time. Write a short, first-person narrative — as the sales AI about to help them — of what you understood.

Company domain: ${cleanDomain}

${websiteContent
    ? `Website content:\n${websiteContent}`
    : `Could not fetch the site directly. Infer what you can from the domain name alone.`}

REQUIREMENTS:
- Four short paragraphs, no headings, no bullet points.
- Paragraph 1 (2 sentences): what the company does and who they sell to.
- Paragraph 2 (2 sentences): the buyer persona — who's likely signing the check.
- Paragraph 3 (2 sentences): one concrete outbound angle you'd bet on first.
- Paragraph 4 (1 sentence): what you'll do next to build their prospect list.
- No hedging ("it appears", "might be"). State conclusions directly.
- No superlatives ("revolutionary", "cutting-edge"). Professional, calm.
- Present tense, first person plural ("we").

Write the narrative now.`;

  const result = await tracedStreamText({
    model,
    prompt,
    temperature: 0.3,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
    _trace: {
      agentId: "onboarding-narrator",
      tenantId: authCtx.tenantId,
      inputPreview: `Narrative for ${cleanDomain}`,
    },
  });

  return result.toTextStreamResponse();
}

// ─── Scraping helpers ───────────────────────────────────────────
// Intentionally lighter than analyze-website: we only need enough
// signal for a narrative, not for structured ICP extraction. If the
// scrape fails the LLM still produces a reasonable narrative from
// the domain name alone.

async function scrapeWebsite(domain: string): Promise<string | null> {
  const candidates = [`https://${domain}`, `https://www.${domain}`];

  for (const url of candidates) {
    try {
      const check = await assertPublicUrl(url);
      if (!check.ok || !check.url) continue;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);

      const res = await fetch(check.url, {
        signal: ctrl.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; LeadSens/1.0; +https://leadsens.app)",
          accept: "text/html",
        },
        redirect: "manual",
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const html = await res.text();
      return extractNarrativeSlice(html, url);
    } catch {
      continue;
    }
  }
  return null;
}

/** Pulls the bits of HTML a narrator actually needs: title, meta,
 * headings, and ~2k chars of body text. No need for the DOM tree. */
function extractNarrativeSlice(html: string, url: string): string {
  const extract = (re: RegExp): string => {
    const m = html.match(re);
    return m?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "";
  };

  const title = extract(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc =
    extract(
      /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
    ) ||
    extract(
      /<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i,
    );
  const ogDesc = extract(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i,
  );

  const headings: string[] = [];
  const hRe = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  let match: RegExpExecArray | null;
  while ((match = hRe.exec(html)) !== null && headings.length < 12) {
    const t = match[1].replace(/<[^>]*>/g, "").trim();
    if (t.length > 3 && t.length < 200) headings.push(t);
  }

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

  return [
    `URL: ${url}`,
    title && `Title: ${title}`,
    metaDesc && `Description: ${metaDesc}`,
    ogDesc && ogDesc !== metaDesc && `OG description: ${ogDesc}`,
    headings.length > 0 && `Headings: ${headings.join(" | ")}`,
    body && `Page excerpt: ${body}`,
  ]
    .filter(Boolean)
    .join("\n");
}
