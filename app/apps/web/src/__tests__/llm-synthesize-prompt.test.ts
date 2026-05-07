import { describe, it, expect } from "vitest";
import {
  buildSynthesizePrompt,
  validateSynthesizeResult,
  SYNTHESIZE_LIMITS,
} from "@/lib/deal-autofill/llm-synthesize-prompt";

describe("buildSynthesizePrompt", () => {
  const baseIncoming = {
    value: "GDPR fines incoming this quarter",
    source: "email",
    date: "2026-05-07T10:00:00Z",
  };

  it("includes both current + incoming when current is present", () => {
    const p = buildSynthesizePrompt({
      field: "why_now",
      current: {
        value: "compliance audit Q4",
        source: "transcript",
        date: "2026-04-01T10:00:00Z",
      },
      incoming: baseIncoming,
    });
    expect(p.user).toContain("compliance audit Q4");
    expect(p.user).toContain("GDPR fines incoming");
    expect(p.user).toContain("Synthesise");
  });

  it("notes 'first version' when current is null", () => {
    const p = buildSynthesizePrompt({
      field: "summary",
      current: null,
      incoming: baseIncoming,
    });
    expect(p.user).toContain("first version");
  });

  it("includes deal context line when provided", () => {
    const p = buildSynthesizePrompt({
      field: "why_now",
      current: null,
      incoming: baseIncoming,
      dealContext: { name: "Acme Q3", stage: "demo", value: 50000 },
    });
    expect(p.user).toContain("Acme Q3");
    expect(p.user).toContain("demo");
    expect(p.user).toContain("$50,000");
  });

  it("omits deal context line when null", () => {
    const p = buildSynthesizePrompt({
      field: "why_now",
      current: null,
      incoming: baseIncoming,
    });
    expect(p.user).not.toContain("Deal context");
  });

  it("includes the source attribution + date for both narratives", () => {
    const p = buildSynthesizePrompt({
      field: "why_now",
      current: {
        value: "old",
        source: "transcript",
        date: "2026-04-01T10:00:00Z",
      },
      incoming: { value: "new", source: "email", date: "2026-05-07T10:00:00Z" },
    });
    expect(p.user).toMatch(/source : transcript/);
    expect(p.user).toMatch(/source : email/);
    expect(p.user).toMatch(/Apr 1, 2026/);
    expect(p.user).toMatch(/May 7, 2026/);
  });

  it("truncates over-long input narratives at MAX_INPUT_LEN", () => {
    const huge = "x".repeat(SYNTHESIZE_LIMITS.MAX_INPUT_LEN + 1000);
    const p = buildSynthesizePrompt({
      field: "summary",
      current: null,
      incoming: { ...baseIncoming, value: huge },
    });
    // Should contain the ellipsis suffix.
    expect(p.user).toContain("…");
    // Substring beyond cap shouldn't be in there.
    expect(p.user.length).toBeLessThan(huge.length + 2000);
  });

  it("system prompt enforces ≤ MAX_OUTPUT_LEN char rule + no bullets", () => {
    const p = buildSynthesizePrompt({
      field: "why_now",
      current: null,
      incoming: baseIncoming,
    });
    expect(p.system).toContain(`${SYNTHESIZE_LIMITS.MAX_OUTPUT_LEN}`);
    expect(p.system).toMatch(/no bullet/i);
  });

  it("handles unparseable date strings without throwing", () => {
    const p = buildSynthesizePrompt({
      field: "why_now",
      current: null,
      incoming: { ...baseIncoming, date: "not a date" },
    });
    expect(p.user).toContain("unknown date");
  });
});

describe("validateSynthesizeResult", () => {
  it("accepts a clean paragraph", () => {
    const r = validateSynthesizeResult(
      "Originally tracking compliance audit Q4 ; per the May 7 call, now driven by GDPR fines incoming this quarter.",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toContain("Originally");
  });

  it("strips leading/trailing markdown fences", () => {
    const r = validateSynthesizeResult(
      "```\nSome paragraph here.\n```",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Some paragraph here.");
  });

  it("rejects empty / whitespace input", () => {
    expect(validateSynthesizeResult("").ok).toBe(false);
    expect(validateSynthesizeResult("   ").ok).toBe(false);
  });

  it("rejects bullet-list outputs (system rule)", () => {
    const r = validateSynthesizeResult(
      "- First point\n- Second point",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bullet_list_rejected");
  });

  it("rejects star-bullet outputs", () => {
    expect(validateSynthesizeResult("* Item one\n* Item two").ok).toBe(false);
  });

  it("rejects numbered-list outputs", () => {
    expect(validateSynthesizeResult("1. Foo\n2. Bar").ok).toBe(false);
  });

  it("rejects markdown headings", () => {
    expect(validateSynthesizeResult("# Big heading\nThen paragraph").ok).toBe(
      false,
    );
    expect(validateSynthesizeResult("## Subhead\nText").ok).toBe(false);
  });

  it("trims at sentence boundary when over MAX_OUTPUT_LEN", () => {
    const a = "First sentence. ".repeat(50); // ~800 chars
    const b = "Long sentence with no break " + "x".repeat(500);
    const long = a + b;
    expect(long.length).toBeGreaterThan(SYNTHESIZE_LIMITS.MAX_OUTPUT_LEN);
    const r = validateSynthesizeResult(long);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.length).toBeLessThanOrEqual(SYNTHESIZE_LIMITS.MAX_OUTPUT_LEN);
      // Sentence boundary trim → ends with ". "
      expect(r.value.endsWith(".")).toBe(true);
    }
  });

  it("falls back to hard char cap when no sentence boundary in zone", () => {
    const noSentence = "x".repeat(SYNTHESIZE_LIMITS.MAX_OUTPUT_LEN + 500);
    const r = validateSynthesizeResult(noSentence);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.length).toBeLessThanOrEqual(SYNTHESIZE_LIMITS.MAX_OUTPUT_LEN);
  });

  it("rejects fenced output that becomes empty after strip", () => {
    expect(validateSynthesizeResult("```\n\n```").ok).toBe(false);
  });
});
