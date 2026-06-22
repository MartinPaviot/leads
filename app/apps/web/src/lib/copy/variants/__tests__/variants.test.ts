import { describe, it, expect, vi } from "vitest";
import {
  runQc,
  sendEligible,
  countLinks,
  generateVariants,
  type QcInput,
  type VariantDraft,
  type VariantSetSpec,
  type GenerateVariantsDeps,
} from "../index";

const clean: QcInput = {
  body: "Hi Jane, saw you raised your seed in May. We help seed startups run outbound without an SDR. Worth a quick call? https://elevay.dev/demo",
  subject: "Quick idea for your launch",
  evidence: [{ id: "e1" }],
  personalization_level: "high",
};

describe("runQc — AC2 deterministic checks", () => {
  it("a clean cold email passes every check", () => {
    const r = runQc(clean);
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
    expect(Object.values(r.checks).every(Boolean)).toBe(true);
  });

  it("fails spam on a spammy body", () => {
    const r = runQc({ ...clean, body: "ACT NOW!!! 100% FREE guaranteed CASH BONUS — click here now", evidence: [], personalization_level: "low" });
    expect(r.checks.spam).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.startsWith("spam:"))).toBe(true);
  });

  it("fails links when more than one link (single-link rule)", () => {
    const r = runQc({ ...clean, body: "See https://a.com and https://b.com for more." });
    expect(r.checks.links).toBe(false);
    expect(r.failures).toContain("links:more-than-one");
  });

  it("fails length when the body is too long for cold outbound", () => {
    const r = runQc({ ...clean, body: "word ".repeat(400) });
    expect(r.checks.length).toBe(false);
    expect(r.failures).toContain("length:too-long");
  });

  it("fails length when the body is too short", () => {
    const r = runQc({ ...clean, body: "hi" });
    expect(r.failures).toContain("length:too-short");
  });

  it("fails plain-text on HTML markup", () => {
    const r = runQc({ ...clean, body: "Hi Jane, <b>great</b> launch. We help seed startups. Worth a call?" });
    expect(r.checks.plainText).toBe(false);
    expect(r.failures).toContain("plain-text:html");
  });

  it("fails grounding when a high-personalization variant has no evidence", () => {
    const r = runQc({ ...clean, evidence: [] });
    expect(r.checks.grounding).toBe(false);
    expect(r.failures).toContain("grounding:high-without-evidence");
  });

  it("a low-personalization (segment) variant needs no evidence", () => {
    const r = runQc({ body: "Seed founders we work with cut SDR cost in half. Worth a quick chat? https://elevay.dev/x", evidence: [], personalization_level: "low" });
    expect(r.checks.grounding).toBe(true);
  });

  it("fails brand on an em-dash", () => {
    const r = runQc({ ...clean, body: "Hi Jane, saw your seed raise—nice timing. We help seed startups. Worth a call? https://elevay.dev/d" });
    expect(r.checks.brand).toBe(false);
    expect(r.failures.some((f) => f.startsWith("brand:"))).toBe(true);
  });

  it("fails brand on a banned word", () => {
    const r = runQc({ ...clean, body: "We leverage AI to help seed startups grow. Worth a quick call? https://elevay.dev/d" }, { banned: ["leverage"] });
    expect(r.failures.some((f) => f.includes("leverage"))).toBe(true);
  });

  it("AC2 brand: informal FR under vouvoiement fails", () => {
    const r = runQc(
      { body: "Salut Jean, vu que tu as leve en mai, on devrait parler. https://elevay.dev/d", evidence: [{ id: "e1" }], personalization_level: "high" },
      { lang: "fr" },
    );
    expect(r.checks.brand).toBe(false);
    expect(r.failures.some((f) => f.includes("fr-informal"))).toBe(true);
  });

  it("re-running QC on the same input is stable", () => {
    expect(runQc(clean)).toEqual(runQc(clean));
  });
});

describe("countLinks", () => {
  it("counts urls, anchors and markdown links", () => {
    expect(countLinks("a https://x.com <a href=\"y\">z</a> [m](page)")).toBe(3);
  });
});

describe("sendEligible — AC3 + AC5 computed", () => {
  const pass = runQc(clean);
  const fail = runQc({ ...clean, evidence: [] }); // grounding fail

  it("AC5: a QC-failing variant is never send-eligible", () => {
    expect(sendEligible(fail, { mode: "autonomous" })).toBe(false);
    expect(sendEligible(fail, { mode: "gated", approved: true })).toBe(false);
  });
  it("autonomous + QC pass → send-eligible", () => {
    expect(sendEligible(pass, { mode: "autonomous" })).toBe(true);
  });
  it("AC3: gated + QC pass but not approved → not send-eligible", () => {
    expect(sendEligible(pass, { mode: "gated", approved: false })).toBe(false);
    expect(sendEligible(pass, { mode: "gated" })).toBe(false);
  });
  it("gated + QC pass + approved → send-eligible", () => {
    expect(sendEligible(pass, { mode: "gated", approved: true })).toBe(true);
  });
});

describe("generateVariants — AC1 one axis + AC4 audit", () => {
  const spec: VariantSetSpec = { slot: "step-1", axis: "cta", axisValues: ["call", "demo", "reply"] };
  let n = 0;
  const deps = (over: Partial<GenerateVariantsDeps> = {}): GenerateVariantsDeps => ({
    newId: () => `v-${++n}`,
    approval: { mode: "autonomous" },
    generate: async (axisValue): Promise<VariantDraft> => ({
      body: `Hi Jane, saw your seed raise. We help seed startups. CTA: ${axisValue}? https://elevay.dev/d`,
      subject: "Quick idea",
      evidence: [{ id: "e1" }],
      personalization_level: "high",
      promptContext: { model: "stub" },
    }),
    ...over,
  });

  it("produces one variant per axis value, each tagged with the declared axis", async () => {
    const variants = await generateVariants(spec, deps());
    expect(variants).toHaveLength(3);
    expect(variants.every((v) => v.axis === "cta")).toBe(true);
    expect(variants.map((v) => v.axisValue)).toEqual(["call", "demo", "reply"]);
    expect(variants.every((v) => v.sendEligible)).toBe(true); // clean + autonomous
  });

  it("AC4: each variant stores prompt context + evidence for audit", async () => {
    const [v] = await generateVariants(spec, deps());
    expect(v.promptContext).toMatchObject({ axis: "cta", axisValue: "call", model: "stub" });
    expect(v.evidence).toEqual([{ id: "e1" }]);
  });

  it("a QC-failing draft is generated but not send-eligible", async () => {
    const variants = await generateVariants(spec, deps({
      generate: async (axisValue): Promise<VariantDraft> => ({ body: `ACT NOW!!! guaranteed CASH BONUS ${axisValue}`, evidence: [], personalization_level: "low" }),
    }));
    expect(variants).toHaveLength(3);
    expect(variants.every((v) => v.sendEligible === false)).toBe(true);
  });

  it("a generator throw drops only that variant", async () => {
    const variants = await generateVariants(spec, deps({
      generate: async (axisValue): Promise<VariantDraft> => {
        if (axisValue === "demo") throw new Error("model down");
        return { body: "Hi Jane, saw your seed raise. We help seed startups. Worth a call? https://elevay.dev/d", evidence: [{ id: "e1" }], personalization_level: "high" };
      },
    }));
    expect(variants.map((v) => v.axisValue)).toEqual(["call", "reply"]);
  });
});
