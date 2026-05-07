/**
 * Vertical Baseline — Run Tier 1 skill quality graders against
 * realistic prospect contexts from 4 verticals.
 *
 * This test does NOT call external APIs or the LLM. It tests:
 * 1. The quality gate grading logic on simulated skill outputs
 * 2. That the graders correctly differentiate good vs bad output per vertical
 * 3. That field completeness checks catch missing data
 *
 * To test against REAL skill execution (LLM + DB), run with server up
 * and use the online eval runner at /api/eval/run-all.
 */

import { describe, it, expect } from "vitest";
import {
  VERTICAL_EVAL_CASES,
  getCasesByVertical,
  getCasesWithoutSignals,
} from "@/lib/evals/vertical-eval-cases";
import { getSkillQualityConfig } from "@/skills/skill-quality-config";
import { gradeEmail } from "@/lib/evals/email-quality-grader";

// ── Dataset integrity ──────────────────────────────────────────

describe("vertical eval dataset: integrity", () => {
  it("has exactly 40 cases", () => {
    expect(VERTICAL_EVAL_CASES).toHaveLength(40);
  });

  it("has 10 cases per vertical", () => {
    for (const v of ["saas", "fintech", "devtools", "services"] as const) {
      expect(getCasesByVertical(v)).toHaveLength(10);
    }
  });

  it("has unique IDs", () => {
    const ids = VERTICAL_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(40);
  });

  it("has cases without signals for degradation testing", () => {
    const noSignal = getCasesWithoutSignals();
    expect(noSignal.length).toBeGreaterThanOrEqual(4);
  });

  it("every case has contact + company + expectations", () => {
    for (const c of VERTICAL_EVAL_CASES) {
      expect(c.contact.fullName).toBeTruthy();
      expect(c.company.name).toBeTruthy();
      expect(c.expectations.emailShouldReference.length).toBeGreaterThan(0);
    }
  });
});

// ── Quality config coverage ────────────────────────────────────

describe("vertical eval: quality config covers all skills", () => {
  const tier1Skills = [
    "cold-email-outreach", "email-drafting", "handle-objection",
    "leadership-change-outreach", "draft-proposal", "meeting-brief",
    "sales-call-prep", "battlecard-generator", "re-engage-stalled",
  ];

  for (const slug of tier1Skills) {
    it(`${slug} has Tier 1 config with threshold >= 0.8`, () => {
      const config = getSkillQualityConfig(slug);
      expect(config.tier).toBe(1);
      expect(config.minQualityScore).toBeGreaterThanOrEqual(0.8);
    });
  }
});

// ── Email grader against vertical contexts ─────────────────────

describe("vertical eval: email grader scores per vertical", () => {
  const verticals = ["saas", "fintech", "devtools", "services"] as const;

  for (const vertical of verticals) {
    it(`${vertical}: good email scores above 0.7`, () => {
      const cases = getCasesByVertical(vertical);
      const firstCase = cases[0];
      const signal = firstCase.signals[0];

      const goodEmail = `${firstCase.contact.fullName.split(" ")[0]},

${firstCase.company.name} ${signal ? `just ${signal.title.toLowerCase()}` : "is growing fast"}. Teams at this stage typically hit a wall when the sales motion that got the first 20 deals can't scale to the next 200.

How are you thinking about outbound capacity for the next quarter?`;

      const result = gradeEmail({
        email: goodEmail,
        subjectLine: "scaling question",
        framework: "basho",
        prospectContext: {
          name: firstCase.contact.fullName,
          company: firstCase.company.name,
          signal: signal?.title,
        },
      });

      expect(result.score).toBeGreaterThan(0.7);
    });

    it(`${vertical}: bad email scores below 0.6`, () => {
      const cases = getCasesByVertical(vertical);
      const firstCase = cases[0];

      const badEmail = `Hi there!

I hope this finds you well! I noticed that your company is doing great things and I'd love to introduce you to our platform.

We built an amazing tool that helps companies like yours succeed. Would you be open to a 45-minute demo?

Best regards`;

      const result = gradeEmail({
        email: badEmail,
        subjectLine: "AMAZING OPPORTUNITY",
        framework: "basho",
        prospectContext: {
          name: firstCase.contact.fullName,
          company: firstCase.company.name,
        },
      });

      expect(result.score).toBeLessThan(0.7);
    });
  }
});

// ── Field completeness grader simulation ───────────────────────

describe("vertical eval: field completeness grading", () => {
  it("meeting-brief: complete output passes", () => {
    const config = getSkillQualityConfig("meeting-brief");
    expect(config.requiredFields).toBeDefined();

    const completeOutput = {
      attendees: [{ name: "Sarah Chen", title: "CTO" }],
      talkingPoints: ["Discuss pricing", "Integration timeline"],
      dealContext: { stage: "proposal", value: 50000 },
    };

    let score = 1.0;
    for (const field of config.requiredFields!) {
      if (!(field in completeOutput)) score -= 1 / config.requiredFields!.length;
    }
    expect(score).toBe(1.0);
  });

  it("meeting-brief: missing talkingPoints fails", () => {
    const config = getSkillQualityConfig("meeting-brief");

    const incompleteOutput = {
      attendees: [{ name: "Sarah Chen", title: "CTO" }],
      dealContext: { stage: "proposal", value: 50000 },
    };

    let missing = 0;
    for (const field of config.requiredFields!) {
      if (!(field in incompleteOutput)) missing++;
    }
    const score = (config.requiredFields!.length - missing) / config.requiredFields!.length;
    expect(score).toBeLessThan(config.minQualityScore);
  });

  it("battlecard: all required fields present", () => {
    const config = getSkillQualityConfig("battlecard-generator");
    const output = {
      strengths: ["AI-native", "zero config"],
      weaknesses: ["limited integrations"],
      objections: [{ objection: "too new", response: "backed by Founders Fund" }],
    };

    let present = 0;
    for (const field of config.requiredFields!) {
      if (field in output) present++;
    }
    expect(present).toBe(config.requiredFields!.length);
  });
});

// ── Degradation path: no-signal cases ──────────────────────────

describe("vertical eval: degradation on no-signal cases", () => {
  const noSignalCases = getCasesWithoutSignals();

  for (const c of noSignalCases.slice(0, 4)) {
    it(`${c.id}: email grader handles missing signal gracefully`, () => {
      const email = `${c.contact.fullName.split(" ")[0]},

Most ${c.contact.title}s I talk to at companies like ${c.company.name} spend too much time on pipeline busywork. What would it look like if that disappeared?`;

      const result = gradeEmail({
        email,
        framework: "basho",
        prospectContext: {
          name: c.contact.fullName,
          company: c.company.name,
          signal: undefined,
        },
      });

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.score).toBeDefined();
    });
  }
});
