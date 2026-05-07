/**
 * Eval suite — inbound-lead-qualification schema contract.
 *
 * Sprint-3 audit follow-up. Validates `inboundLeadQualificationOutputSchema`
 * against canonical valid + invalid shapes. The qualification skill
 * produces structured output consumed by the hot-leads notification
 * pipeline ; a schema regression silently breaks "Hot inbound lead"
 * notifications, so this suite is load-bearing.
 */

import { inboundLeadQualificationOutputSchema } from "@/skills/scoring/inbound-lead-qualification/schema";
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
  contactId: "c1",
  contactName: "Jane Doe",
  companyName: "Acme Inc",
  source: "demo_request",
  score: 78,
  grade: "A" as const,
  qualified: true,
  priority: "hot" as const,
  reasons: [
    "VC-backed Series A devtools — matches ICP",
    "Job title 'Head of Engineering' = primary buyer",
    "Domain validated against TAM",
  ],
  recommendedAction: "Schedule demo within 24 hours — high-intent inbound",
  isDuplicate: false,
  existingContactId: null,
  knowledgeContext: "ICP definition + recent benchmarks for similar tenants",
};

const cases: Case[] = [
  { id: "valid-baseline", description: "hot lead, A grade", input: VALID_OUTPUT, shouldPass: true },
  {
    id: "valid-warm-tier",
    description: "warm priority, B grade",
    input: { ...VALID_OUTPUT, priority: "warm", grade: "B", score: 55 },
    shouldPass: true,
  },
  {
    id: "valid-disqualified",
    description: "disqualified low score",
    input: { ...VALID_OUTPUT, priority: "disqualified", grade: "D", score: 12, qualified: false },
    shouldPass: true,
  },
  {
    id: "valid-duplicate",
    description: "duplicate contact flagged",
    input: { ...VALID_OUTPUT, isDuplicate: true, existingContactId: "c0" },
    shouldPass: true,
  },
  {
    id: "valid-no-company",
    description: "free-email submitter — no company resolved",
    input: { ...VALID_OUTPUT, companyName: null },
    shouldPass: true,
  },

  // ── Invalid ─────────────────────────────────────────────
  {
    id: "invalid-priority-enum",
    description: "priority enum out of range",
    input: { ...VALID_OUTPUT, priority: "ice-cold" },
    shouldPass: false,
  },
  {
    id: "invalid-missing-grade",
    description: "missing grade",
    input: { ...VALID_OUTPUT, grade: undefined },
    shouldPass: false,
  },
  {
    id: "invalid-score-non-numeric",
    description: "score must be number",
    input: { ...VALID_OUTPUT, score: "78" },
    shouldPass: false,
  },
  {
    id: "invalid-reasons-not-array",
    description: "reasons must be string array",
    input: { ...VALID_OUTPUT, reasons: "single string instead of array" },
    shouldPass: false,
  },
];

export const inboundQualificationEvalSuite: EvalSuite<{ ok: boolean }> = {
  surfaceId: "inbound-lead-qualification",
  promptId: "inbound-qualification-schema.v1",
  cases: cases.map((c) => ({
    id: c.id,
    description: c.description,
    run: async () => {
      const result = inboundLeadQualificationOutputSchema.safeParse(c.input);
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

export async function runInboundQualificationEval() {
  return runEvalSuite(inboundQualificationEvalSuite);
}
