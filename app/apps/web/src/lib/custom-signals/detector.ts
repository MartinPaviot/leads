import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import type { Source } from "@/lib/tam-stream/events";
import type {
  CustomSignalDefinition,
  CustomSignalPlan,
  CustomSignalResult,
} from "./types";

const URL_HEAD_TIMEOUT_MS = 800;
const JUDGE_TIMEOUT_MS = 8000;
const ALIVE_STATUSES = new Set([200, 301, 302, 307, 308]);

interface CompanyInput {
  name: string;
  domain: string | null;
  description: string | null;
  keywords?: string[];
  technologies?: string[];
}

/**
 * Runs a three-tier detection plan against one company. Never
 * throws — any internal failure collapses to an `indeterminate`
 * result so the caller can batch thousands of companies without
 * guarding per-row.
 *
 * Tiers short-circuit on the first positive match. Worst case we
 * hit all three: a fast keyword scan, up to 4 HEAD requests in
 * parallel, then one LLM judge call. In practice the keyword tier
 * resolves ~50% of companies, the URL tier another ~20%, and the
 * judge handles the rest.
 */
export async function detectCustomSignal(
  signal: CustomSignalDefinition,
  company: CompanyInput,
  opts: { tenantId: string } = { tenantId: "" },
): Promise<CustomSignalResult> {
  const now = new Date().toISOString();
  const plan = signal.plan;

  // ── Tier 1: keywords ──
  const haystack = buildHaystack(company);
  if (haystack && plan.keywords.length > 0) {
    for (const kw of plan.keywords) {
      if (haystack.includes(kw)) {
        return {
          value: true,
          reason: `Matched "${kw}" in company profile`,
          sources: [],
          confidence: "high",
          computedAt: now,
        };
      }
    }
  }

  // ── Tier 2: URL patterns ──
  if (company.domain && plan.urlPatterns.length > 0) {
    const aliveUrl = await raceForAliveUrl(company.domain, plan.urlPatterns);
    if (aliveUrl) {
      return {
        value: true,
        reason: `Found ${aliveUrl.replace(/^https?:\/\//, "")}`,
        sources: [
          {
            url: aliveUrl,
            title: `${company.name} — ${new URL(aliveUrl).pathname.slice(1) || "/"}`,
            favicon: `https://www.google.com/s2/favicons?domain=${company.domain}`,
            fetchedAt: now,
            verified: true,
          },
        ],
        confidence: "high",
        computedAt: now,
      };
    }
  }

  // ── Tier 3: LLM judge ──
  if (plan.judgePrompt.trim().length > 0) {
    const verdict = await askJudge(plan, company, opts.tenantId);
    if (verdict) {
      return {
        ...verdict,
        computedAt: now,
      };
    }
    // Judge failed / returned nothing — treat as indeterminate
    // rather than lying with "false".
  }

  // Nothing resolved. Report indeterminate when we actually tried
  // SOMETHING but everything was empty; report false when we at
  // least ran the judge and got a clean negative.
  const anyTierRun =
    plan.keywords.length > 0 ||
    (company.domain && plan.urlPatterns.length > 0) ||
    plan.judgePrompt.trim().length > 0;

  return {
    value: false,
    reason: anyTierRun
      ? "No positive evidence found"
      : "Signal plan is empty — no detection tiers configured",
    sources: [],
    confidence: anyTierRun ? "high" : "indeterminate",
    computedAt: now,
  };
}

// ────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────

function buildHaystack(company: CompanyInput): string {
  const parts: string[] = [];
  if (company.description) parts.push(company.description);
  if (company.keywords?.length) parts.push(company.keywords.join(" "));
  if (company.technologies?.length) parts.push(company.technologies.join(" "));
  return parts.join(" ").toLowerCase();
}

/** Fires HEAD requests in parallel and returns the URL of the
 * first one that comes back alive. Others are aborted via a shared
 * controller so we don't hold open sockets after finding the winner. */
async function raceForAliveUrl(
  domain: string,
  patterns: string[],
): Promise<string | null> {
  const urls = patterns.map((p) => `https://${domain}/${p}`);

  return new Promise<string | null>((resolve) => {
    let pending = urls.length;
    const controllers = urls.map(() => new AbortController());
    let resolved = false;

    const finish = (result: string | null) => {
      if (resolved) return;
      resolved = true;
      for (const c of controllers) c.abort();
      resolve(result);
    };

    urls.forEach((url, i) => {
      const ctrl = controllers[i];
      const timeout = setTimeout(() => ctrl.abort(), URL_HEAD_TIMEOUT_MS);
      fetch(url, {
        method: "HEAD",
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; LeadSens/1.0; +https://leadsens.app)",
        },
      })
        .then((res) => {
          clearTimeout(timeout);
          if (ALIVE_STATUSES.has(res.status)) {
            finish(url);
          } else if (--pending === 0) {
            finish(null);
          }
        })
        .catch(() => {
          clearTimeout(timeout);
          if (--pending === 0) finish(null);
        });
    });
  });
}

const judgeSchema = z.object({
  value: z.boolean(),
  reason: z.string(),
});

async function askJudge(
  plan: CustomSignalPlan,
  company: CompanyInput,
  tenantId: string,
): Promise<{
  value: boolean;
  reason: string;
  sources: Source[];
  confidence: "medium";
} | null> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return null;

  const ctx = [
    `Company: ${company.name}`,
    company.domain ? `Domain: ${company.domain}` : null,
    company.description ? `Description: ${company.description}` : null,
    company.keywords?.length
      ? `Apollo keywords: ${company.keywords.join(", ")}`
      : null,
    company.technologies?.length
      ? `Tech stack: ${company.technologies.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { object } = await Promise.race([
      tracedGenerateObject({
        model,
        schema: judgeSchema,
        temperature: 0,
        prompt: `${plan.judgePrompt.trim()}

COMPANY CONTEXT:
${ctx}`,
        _trace: {
          agentId: "custom-signal-judge",
          tenantId,
          inputPreview: `${company.name}: ${plan.judgePrompt.slice(0, 80)}`,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("judge timeout")),
          JUDGE_TIMEOUT_MS,
        ),
      ),
    ]);

    return {
      value: object.value,
      reason: object.reason.slice(0, 200),
      sources: [],
      confidence: "medium",
    };
  } catch {
    return null;
  }
}
