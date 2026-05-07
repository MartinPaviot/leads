/**
 * Eval suite — churn-risk-detector schema contract.
 *
 * Sprint-3 audit follow-up. Same shape as `deal-briefing.eval.ts` :
 * validates the structured-output schema against valid + invalid
 * fixtures so prompt drift gets caught at eval-time.
 */

import { churnRiskDetectorOutputSchema } from "@/skills/intelligence/churn-risk-detector/schema";
import {
  runEvalSuite,
  type EvalSuite,
} from "../harness";

interface Case {
  id: string;
  description: string;
  input: unknown;
  shouldPass: boolean;
}

const VALID_OUTPUT = {
  period: "Last 60 days",
  totalAccountsAnalyzed: 42,
  atRiskAccounts: [
    {
      companyId: "c1",
      companyName: "Acme Inc",
      riskLevel: "high" as const,
      daysSinceLastActivity: 21,
      totalActivitiesInPeriod: 3,
      activeDealCount: 1,
      totalDealValue: 50000,
      negativeSentimentCount: 2,
      riskReasons: [
        "No outbound contact in 21 days",
        "Last meeting had negative sentiment about onboarding speed",
      ],
      suggestedAction: "Schedule executive QBR within 7 days",
    },
  ],
  summary: {
    critical: 2,
    high: 5,
    medium: 7,
    totalAtRiskValue: 320000,
  },
};

const cases: Case[] = [
  // ── Valid ───────────────────────────────────────────────
  { id: "valid-baseline", description: "well-formed output", input: VALID_OUTPUT, shouldPass: true },
  {
    id: "valid-empty-at-risk",
    description: "no at-risk accounts (healthy tenant)",
    input: { ...VALID_OUTPUT, atRiskAccounts: [], summary: { critical: 0, high: 0, medium: 0, totalAtRiskValue: 0 } },
    shouldPass: true,
  },
  {
    id: "valid-multi-reasons",
    description: "multiple risk reasons per account",
    input: {
      ...VALID_OUTPUT,
      atRiskAccounts: [
        {
          ...VALID_OUTPUT.atRiskAccounts[0],
          riskReasons: ["A", "B", "C", "D", "E"],
        },
      ],
    },
    shouldPass: true,
  },
  {
    id: "valid-critical-tier",
    description: "critical riskLevel allowed",
    input: {
      ...VALID_OUTPUT,
      atRiskAccounts: [{ ...VALID_OUTPUT.atRiskAccounts[0], riskLevel: "critical" }],
    },
    shouldPass: true,
  },

  // ── Invalid — schema regressions to catch ──────────────
  {
    id: "invalid-missing-summary",
    description: "missing summary object",
    input: { ...VALID_OUTPUT, summary: undefined },
    shouldPass: false,
  },
  {
    id: "invalid-risk-enum",
    description: "riskLevel out of allowed enum (low not in v1 enum)",
    input: {
      ...VALID_OUTPUT,
      atRiskAccounts: [{ ...VALID_OUTPUT.atRiskAccounts[0], riskLevel: "low" }],
    },
    shouldPass: false,
  },
  {
    id: "invalid-no-suggested-action",
    description: "missing suggestedAction (required)",
    input: {
      ...VALID_OUTPUT,
      atRiskAccounts: [{ ...VALID_OUTPUT.atRiskAccounts[0], suggestedAction: undefined }],
    },
    shouldPass: false,
  },
  {
    id: "invalid-non-numeric-summary",
    description: "summary.critical must be number",
    input: { ...VALID_OUTPUT, summary: { ...VALID_OUTPUT.summary, critical: "two" } },
    shouldPass: false,
  },
];

export const churnRiskEvalSuite: EvalSuite<{ ok: boolean }> = {
  surfaceId: "churn-risk-detector",
  promptId: "churn-risk-schema.v1",
  cases: cases.map((c) => ({
    id: c.id,
    description: c.description,
    run: async () => {
      const result = churnRiskDetectorOutputSchema.safeParse(c.input);
      return { ok: result.success };
    },
    predicate: (out) => out.ok === c.shouldPass,
  })),
  aggregateMetrics: (results) => {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    return {
      pass_rate: total ? passed / total : 0,
      total_cases: total,
    };
  },
};

export async function runChurnRiskEval() {
  return runEvalSuite(churnRiskEvalSuite);
}
