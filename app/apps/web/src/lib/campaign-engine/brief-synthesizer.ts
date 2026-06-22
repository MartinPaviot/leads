import Anthropic from "@anthropic-ai/sdk";
import type {
  IntelligenceBrief,
  NewsItem,
  JobPosting,
  TechEntry,
  LinkedInActivity,
  CommunicationStyle,
  PublicContentPiece,
  WarmthSignal,
} from "./types";
import type { WebsiteResult } from "./sources/website";

const anthropic = new Anthropic();

interface RawSources {
  website: WebsiteResult | null;
  news: NewsItem[];
  jobs: JobPosting[];
  techStack: TechEntry[];
  linkedin: LinkedInActivity | null;
}

interface CompanyContext {
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
}

interface ContactContext {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
}

export interface SynthesizedFields {
  painPoints: string[];
  bestAngle: string | null;
  warmthSignals: WarmthSignal[];
  publicContent: PublicContentPiece[];
  publicContentDepth: number;
  communicationStyle: CommunicationStyle | null;
  competitorDetected: string | null;
  websiteSummary: string | null;
}

const SYSTEM_PROMPT = `You analyze raw research data about a prospect company and contact to produce structured intelligence for sales outreach.

Your output MUST be valid JSON matching this schema:
{
  "websiteSummary": "1-3 sentence company description",
  "painPoints": ["pain point 1", "pain point 2", ...],
  "bestAngle": "One sentence: the single best outreach angle for this prospect",
  "competitorDetected": "competitor tool name or null",
  "communicationStyle": { "formality": "formal|casual|mixed", "preferredLength": "short|medium|long", "tone": "descriptive tone" } or null,
  "publicContent": [{"type": "linkedin_post|blog_post|podcast|talk|tweet|metric", "title": "...", "quote": "citable snippet, or for type=metric the verified fact e.g. '120 employees'", "url": "", "date": ""}],
  "warmthSignals": [{"type": "mutual_connection|shared_community|alumni|shared_investor|past_interaction", "detail": "..."}]
}

Rules:
- painPoints: infer 1-5 pain points from job postings (what they're hiring for = gaps), tech stack (legacy tools), and news (challenges mentioned)
- bestAngle: what specific value could we bring them RIGHT NOW based on their current situation
- competitorDetected: if their tech stack or job postings mention a known CRM/sales/marketing tool, name it
- publicContent: extract any citable content from the website or LinkedIn data
- warmthSignals: only include if there's actual evidence
- Be concise. No filler. Every field must be actionable for crafting outreach.`;

export async function synthesizeBrief(
  sources: RawSources,
  company: CompanyContext,
  contact: ContactContext | null
): Promise<SynthesizedFields> {
  const userContent = buildUserPrompt(sources, company, contact);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackSynthesis(sources);

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      websiteSummary: parsed.websiteSummary || null,
      painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints.slice(0, 5) : [],
      bestAngle: parsed.bestAngle || null,
      competitorDetected: parsed.competitorDetected || null,
      communicationStyle: parsed.communicationStyle || null,
      publicContent: Array.isArray(parsed.publicContent) ? parsed.publicContent : [],
      publicContentDepth: Array.isArray(parsed.publicContent) ? parsed.publicContent.length : 0,
      warmthSignals: Array.isArray(parsed.warmthSignals) ? parsed.warmthSignals : [],
    };
  } catch {
    return fallbackSynthesis(sources);
  }
}

function buildUserPrompt(
  sources: RawSources,
  company: CompanyContext,
  contact: ContactContext | null
): string {
  const parts: string[] = [];

  parts.push(`## Company: ${company.name}`);
  if (company.domain) parts.push(`Domain: ${company.domain}`);
  if (company.industry) parts.push(`Industry: ${company.industry}`);
  if (company.size) parts.push(`Size: ${company.size}`);

  if (contact) {
    parts.push(`\n## Contact: ${contact.firstName || ""} ${contact.lastName || ""}`);
    if (contact.title) parts.push(`Title: ${contact.title}`);
  }

  if (sources.website) {
    parts.push(`\n## Website Content`);
    if (sources.website.metaDescription) parts.push(`Meta: ${sources.website.metaDescription}`);
    if (sources.website.headings.length) parts.push(`Headings: ${sources.website.headings.join(", ")}`);
    parts.push(`Body (excerpt): ${sources.website.rawText.slice(0, 1500)}`);
  }

  if (sources.news.length > 0) {
    parts.push(`\n## Recent News (last 90 days)`);
    for (const n of sources.news) {
      parts.push(`- ${n.date.slice(0, 10)}: ${n.title}`);
    }
  }

  if (sources.jobs.length > 0) {
    parts.push(`\n## Open Job Postings`);
    for (const j of sources.jobs) {
      parts.push(`- ${j.title}${j.department ? ` (${j.department})` : ""}`);
    }
  }

  if (sources.techStack.length > 0) {
    parts.push(`\n## Detected Tech Stack`);
    parts.push(sources.techStack.map((t) => `${t.tool} (${t.category})`).join(", "));
  }

  if (sources.linkedin) {
    parts.push(`\n## LinkedIn Activity`);
    parts.push(`Posting frequency: ~${sources.linkedin.postsPerWeek}/week`);
    parts.push(`Tone: ${sources.linkedin.tone}`);
    if (sources.linkedin.recentTopics.length) {
      parts.push(`Topics: ${sources.linkedin.recentTopics.join(", ")}`);
    }
  }

  return parts.join("\n");
}

function fallbackSynthesis(sources: RawSources): SynthesizedFields {
  return {
    websiteSummary: sources.website?.metaDescription || null,
    painPoints: [],
    bestAngle: null,
    competitorDetected: detectCompetitorFromTech(sources.techStack),
    communicationStyle: null,
    publicContent: [],
    publicContentDepth: 0,
    warmthSignals: [],
  };
}

function detectCompetitorFromTech(techStack: TechEntry[]): string | null {
  const crmTools = techStack.filter((t) => t.category === "crm");
  return crmTools.length > 0 ? crmTools[0].tool : null;
}
