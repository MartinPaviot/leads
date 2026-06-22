/**
 * P1-9 — the ToolSet the research agent drives. Each tool wraps an existing
 * deterministic source (website/jobs/news/tech) or the new browsePage crawler.
 * Every execute is fail-soft (returns { ok:false } instead of throwing so the
 * model can pivot), timeout-bounded (withTimeout), and memoised per (name,args)
 * within a run (no refetch, token economy). A tool is only registered when its
 * dependency exists (no fetchWebsite without a domain, no enrichApollo without
 * the P1-10 impl).
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { withTimeout } from "@/lib/utils/with-timeout";
import { scrapeCompanyWebsite, type WebsiteResult } from "./sources/website";
import { scrapeJobPostings } from "./sources/jobs";
import { fetchRecentNews } from "./sources/news";
import { detectTechStack } from "./sources/tech-stack";
import { browsePage } from "./sources/browse-page";
import type { NewsItem, JobPosting, TechEntry } from "./types";

const TOOL_TIMEOUT_MS = 8_000;

export interface ToolLedger {
  attempted: number;
  succeeded: number;
  errors: Array<{ source: string; error: string }>;
  collected: { news: NewsItem[]; jobs: JobPosting[]; techStack: TechEntry[]; website: WebsiteResult | null };
  memo: Map<string, unknown>;
}

export function newToolLedger(): ToolLedger {
  return {
    attempted: 0,
    succeeded: 0,
    errors: [],
    collected: { news: [], jobs: [], techStack: [], website: null },
    memo: new Map(),
  };
}

type ToolOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** memo → attempted++ → withTimeout → collect/error → memo. Never throws. */
async function runTool<T>(
  ledger: ToolLedger,
  name: string,
  args: unknown,
  fn: () => Promise<T | null>,
  onSuccess?: (v: T) => void,
): Promise<ToolOutcome<T>> {
  const key = `${name}:${JSON.stringify(args)}`;
  if (ledger.memo.has(key)) return ledger.memo.get(key) as ToolOutcome<T>;
  ledger.attempted++;
  const v = await withTimeout(fn(), TOOL_TIMEOUT_MS);
  let result: ToolOutcome<T>;
  if (v === null || v === undefined) {
    ledger.errors.push({ source: name, error: "returned null or timed out" });
    result = { ok: false, error: "no data (source returned null or timed out)" };
  } else {
    ledger.succeeded++;
    onSuccess?.(v);
    result = { ok: true, data: v };
  }
  ledger.memo.set(key, result);
  return result;
}

export interface BuildToolsArgs {
  rootDomain: string | null;
  companyName: string;
  /** P1-10 — conditional. When absent, the enrichApollo tool is NOT registered. */
  enrichApollo?: (args: { domain: string | null }) => Promise<unknown>;
}

export function buildResearchTools(args: BuildToolsArgs, ledger: ToolLedger): ToolSet {
  const { rootDomain, companyName, enrichApollo } = args;
  const tools: ToolSet = {};

  // News works without a domain (company-name based).
  tools.fetchNews = tool({
    description: "Fetch recent news about the company (last ~90 days). Use to find buying-signal triggers.",
    inputSchema: z.object({}),
    execute: async () =>
      runTool(ledger, "news", {}, () => fetchRecentNews(companyName), (v) => {
        ledger.collected.news = v;
      }),
  });

  if (rootDomain) {
    tools.fetchWebsite = tool({
      description: "Scrape the company homepage (meta description, headings, body text). Start here.",
      inputSchema: z.object({}),
      execute: async () =>
        runTool(ledger, "website", {}, () => scrapeCompanyWebsite(rootDomain), (v) => {
          ledger.collected.website = v;
        }),
    });

    tools.browsePage = tool({
      description:
        "Fetch a specific page WITHIN the company domain (e.g. '/pricing', '/about', '/customers') and return its text + internal links. Use the links returned by fetchWebsite/browsePage to dig deeper. Stays on the company domain only.",
      inputSchema: z.object({ path: z.string().describe("Absolute URL on the company domain, or a path like /pricing") }),
      execute: async ({ path }: { path: string }) => runTool(ledger, `browse:${path}`, { path }, () => browsePage(rootDomain, path)),
    });

    tools.fetchJobs = tool({
      description: "Scrape the company's open job postings — what they hire for reveals gaps and priorities.",
      inputSchema: z.object({}),
      execute: async () =>
        runTool(ledger, "jobs", {}, () => scrapeJobPostings(rootDomain), (v) => {
          ledger.collected.jobs = v;
        }),
    });

    tools.detectTechStack = tool({
      description: "Detect the company's tech stack (CRM, analytics, frameworks). Legacy/competitor tools are angles.",
      inputSchema: z.object({}),
      execute: async () =>
        runTool(ledger, "techStack", {}, () => detectTechStack(rootDomain), (v) => {
          ledger.collected.techStack = v;
        }),
    });
  }

  if (enrichApollo) {
    tools.enrichApollo = tool({
      description: "Enrich the company with firmographic + funding + people data (Apollo). Use for headcount, funding stage, and key contacts.",
      inputSchema: z.object({}),
      execute: async () => runTool(ledger, "apollo", {}, () => enrichApollo({ domain: rootDomain })),
    });
  }

  return tools;
}
