import { describe, it, expect, vi } from "vitest";

// Stub DB so the eval harness can persist eval_runs without a real
// database — the actual eval logic is what matters.
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));
vi.mock("@/db/schema", () => ({ evalRuns: {} }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runDealBriefingEval } from "@/lib/evals/suites/deal-briefing.eval";
import { runChurnRiskEval } from "@/lib/evals/suites/churn-risk.eval";
import { runInboundQualificationEval } from "@/lib/evals/suites/inbound-qualification.eval";
import { runTranscriptCoachingEval } from "@/lib/evals/suites/transcript-coaching.eval";

describe("deal-briefing eval suite", () => {
  it("passes every fixture (5 valid + 5 invalid)", async () => {
    const summary = await runDealBriefingEval();
    expect(summary.surfaceId).toBe("deal-briefing");
    expect(summary.casesTotal).toBe(10);
    expect(summary.casesPassed).toBe(10);
    expect(summary.casesErrored).toBe(0);
    expect(summary.metrics.pass_rate).toBe(1);
  });
});

describe("churn-risk eval suite", () => {
  it("passes every fixture (4 valid + 4 invalid)", async () => {
    const summary = await runChurnRiskEval();
    expect(summary.surfaceId).toBe("churn-risk-detector");
    expect(summary.casesTotal).toBe(8);
    expect(summary.casesPassed).toBe(8);
    expect(summary.casesErrored).toBe(0);
  });
});

describe("inbound-qualification eval suite", () => {
  it("passes every fixture (5 valid + 4 invalid)", async () => {
    const summary = await runInboundQualificationEval();
    expect(summary.surfaceId).toBe("inbound-lead-qualification");
    expect(summary.casesTotal).toBe(9);
    expect(summary.casesPassed).toBe(9);
    expect(summary.casesErrored).toBe(0);
  });
});

describe("transcript-coaching eval suite", () => {
  it("passes every fixture (7 cases)", async () => {
    const summary = await runTranscriptCoachingEval();
    expect(summary.surfaceId).toBe("transcript-coaching");
    expect(summary.casesTotal).toBe(7);
    expect(summary.casesPassed).toBe(7);
    expect(summary.casesErrored).toBe(0);
  });
});
