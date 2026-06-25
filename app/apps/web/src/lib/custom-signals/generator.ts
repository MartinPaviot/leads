import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import type { CustomSignalPlan } from "./types";

const planSchema = z.object({
  keywords: z.array(z.string()).describe(
    "Short, case-insensitive substrings that ALMOST CERTAINLY mean the signal is true when found in a company's description/keywords/technology list. Prefer specific terms ('status page', 'statuspage.io', 'uptime monitor') over generic ones ('software'). 0-6 entries.",
  ),
  urlPatterns: z.array(z.string()).describe(
    "URL path fragments (without leading slash) where positive evidence would plausibly live on the company's own domain. Examples: 'status', 'trust', 'security', 'pricing', 'api/docs'. 0-4 entries.",
  ),
  judgePrompt: z.string().describe(
    "One-paragraph instruction for an LLM judge that will be given the company's Apollo description, keywords, and technology list. Must end with: 'Answer YES or NO with a one-sentence reason.' Kept under 400 characters.",
  ),
});

/**
 * Produces a `CustomSignalPlan` from the user's free-form description
 * of a signal they want to detect (e.g. "Companies with a public
 * Status page").
 *
 * The plan is intentionally three-tiered so detection cost scales
 * with ambiguity:
 *
 *   - cheap keyword match first (no API call)
 *   - HEAD-check the most plausible URL patterns next (fast network)
 *   - LLM judge last, and only for companies that the cheap tiers
 *     couldn't classify
 *
 * The generator is called once at signal creation and the result
 * is frozen in DB. Re-running generation requires editing the
 * signal, which creates a new row (history preserved).
 */
export async function generateCustomSignalPlan(args: {
  tenantId: string;
  name: string;
  description: string;
}): Promise<CustomSignalPlan> {
  const { tenantId, name, description } = args;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    // No LLM configured — the signal still works, just falls
    // straight to indeterminate for every company. Better than
    // crashing signal creation.
    return {
      keywords: [],
      urlPatterns: [],
      judgePrompt: "",
    };
  }

  const { object } = await tracedGenerateObject({
    model,
    schema: planSchema,
    temperature: 0.2,
    prompt: `You are designing a boolean signal detector for a B2B sales TAM.

SIGNAL NAME: ${name}
USER DESCRIPTION: ${description}

Design a 3-tier detection plan. Each tier runs against one company
at a time and returns true/false.

TIER 1 — KEYWORDS
Short substrings that almost certainly mean the signal is true when
present in a company's Apollo-fetched description, keywords, or
technology list. Prefer specific terms. 0 to 6 entries. Example for
"Companies using Segment": ["segment", "segment.io", "mParticle",
"analytics pipeline"].

TIER 2 — URL PATTERNS
Path fragments on the company's own domain where positive evidence
would plausibly live. HEAD check only — we only care whether the
URL exists, not its content. 0 to 4 entries. Example for "Companies
with a public Status page": ["status", "statuspage", "status.html"].

TIER 3 — LLM JUDGE PROMPT
A one-paragraph instruction for an LLM given the company's
description, keywords, and tech list. Must end with 'Answer YES or
NO with a one-sentence reason.' Kept under 400 characters. Used
only when tiers 1 and 2 are inconclusive — so the prompt should be
nuanced enough to handle partial evidence.

Generate all three tiers even if one is likely to dominate.`,
    _trace: {
      agentId: "custom-signal-generator",
      tenantId,
      inputPreview: `Plan for "${name}": ${description.slice(0, 120)}`,
    },
  });

  // Normalize — lowercase keywords, strip leading slash from URL
  // patterns, trim whitespace everywhere.
  return {
    keywords: (object.keywords as string[])
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0)
      .slice(0, 6),
    urlPatterns: (object.urlPatterns as string[])
      .map((u: string) => u.trim().replace(/^\/+/, ""))
      .filter((u: string) => u.length > 0)
      .slice(0, 4),
    judgePrompt: (object.judgePrompt as string).trim().slice(0, 800),
  };
}
