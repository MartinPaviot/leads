import { describe, it, expect } from "vitest";
import { KNOWN_SIGNAL_TYPES } from "@/lib/sequences/triggers";
import {
  PROVEN_TEMPLATES,
  getTemplate,
  templatesForTrigger,
  uncoveredSignalTypes,
  validateCatalog,
  toTemplateSummary,
  templateIdOf,
} from "../registry";
import type { ProvenSequenceTemplate } from "../types";

describe("proven template catalog", () => {
  it("is structurally valid (no issues)", () => {
    expect(validateCatalog()).toEqual([]);
  });

  it("covers every known signal type (router never falls back for a known trigger)", () => {
    expect(uncoveredSignalTypes()).toEqual([]);
    for (const sig of KNOWN_SIGNAL_TYPES) {
      expect(templatesForTrigger(sig).length).toBeGreaterThan(0);
    }
  });

  it("each template is trigger-specific and multi-step", () => {
    for (const t of PROVEN_TEMPLATES) {
      expect(t.triggerSignalTypes.length).toBeGreaterThan(0);
      expect(t.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("post-funding template never pitches on the raise (congrats angle only)", () => {
    const t = getTemplate("post-funding")!;
    expect(t).toBeTruthy();
    const firstBody = t.steps[0].bodyTemplate.toLowerCase();
    expect(firstBody).toContain("félicitations");
    // It offers a resource without an immediate meeting ask.
    expect(firstBody).toMatch(/sans contrepartie|pas de rendez-vous/);
  });

  it("ships at least one multi-channel template (email + linkedin)", () => {
    const multi = PROVEN_TEMPLATES.filter(
      (t) => new Set(t.steps.map((s) => s.stepType)).size > 1,
    );
    expect(multi.length).toBeGreaterThan(0);
    const channels = new Set(multi[0].steps.map((s) => s.stepType));
    expect(channels.has("email")).toBe(true);
    expect(channels.has("linkedin_message")).toBe(true);
  });

  it("getTemplate returns null for an unknown id", () => {
    expect(getTemplate("nope")).toBeNull();
  });
});

describe("validateCatalog catches malformed templates", () => {
  const base = (): ProvenSequenceTemplate => ({
    id: "x",
    name: "X",
    description: "d",
    triggerSignalTypes: ["post_funding"],
    personaFit: ["founder"],
    recipientBenefitAngle: "a",
    lang: "fr",
    steps: [
      { stepNumber: 1, stepType: "email", delayDays: 0, subjectTemplate: "Hi {{firstName}}", bodyTemplate: "Body", valueAdded: "v" },
    ],
  });

  it("flags an unsupported interpolation var", () => {
    const t = base();
    t.steps[0].bodyTemplate = "Bonjour {{companyName}}";
    expect(validateCatalog([t]).some((i) => i.templateId === "x" && i.problem.includes("{{companyName}}"))).toBe(true);
  });

  it("flags a whitespace-padded var the send path can't substitute", () => {
    const t = base();
    t.steps[0].bodyTemplate = "Bonjour {{ firstName }}"; // padded → ships literally
    expect(validateCatalog([t]).some((i) => i.problem.includes("{{ firstName }}"))).toBe(true);
  });

  it("flags an underscore var the send path can't substitute", () => {
    const t = base();
    t.steps[0].bodyTemplate = "Bonjour {{first_name}}";
    expect(validateCatalog([t]).some((i) => i.problem.includes("{{first_name}}"))).toBe(true);
  });

  it("flags a banned em-dash anywhere in the copy (AI-slop)", () => {
    const t = base();
    t.steps[0].bodyTemplate = "Bonjour — un mot";
    expect(validateCatalog([t]).some((i) => i.problem.includes('banned copy token "—"'))).toBe(true);
  });

  it("flags an out-of-order step number", () => {
    const t = base();
    t.steps[0].stepNumber = 2;
    expect(validateCatalog([t])).toContainEqual({ templateId: "x", problem: "step 0 has stepNumber 2, expected 1" });
  });

  it("flags an empty subject on an email step", () => {
    const t = base();
    t.steps[0].subjectTemplate = "  ";
    expect(validateCatalog([t])).toContainEqual({ templateId: "x", problem: "email step 1 has an empty subject" });
  });

  it("flags a template with no trigger (would match all signals)", () => {
    const t = base();
    t.triggerSignalTypes = [];
    expect(validateCatalog([t])).toContainEqual({
      templateId: "x",
      problem: "no triggerSignalTypes → would match ALL signals (not trigger-specific)",
    });
  });

  it("flags a duplicate id", () => {
    const a = base();
    const b = base();
    expect(validateCatalog([a, b])).toContainEqual({ templateId: "x", problem: "duplicate template id" });
  });
});

describe("toTemplateSummary (gallery shape)", () => {
  it("derives channels, stepCount, and cadenceDays (sum of delays) without full bodies", () => {
    const s = toTemplateSummary(getTemplate("post-funding")!);
    expect(s.id).toBe("post-funding");
    expect(s.stepCount).toBe(3);
    expect(s.channels).toContain("email");
    expect(s.channels).toContain("linkedin_message");
    expect(s.cadenceDays).toBe(getTemplate("post-funding")!.steps.reduce((n, x) => n + x.delayDays, 0));
    // Summary steps carry preview fields but NOT the full body.
    expect(s.steps[0]).toHaveProperty("subjectTemplate");
    expect(s.steps[0]).toHaveProperty("valueAdded");
    expect(s.steps[0]).not.toHaveProperty("bodyTemplate");
  });

  it("every template summarizes without throwing", () => {
    for (const t of PROVEN_TEMPLATES) {
      const s = toTemplateSummary(t);
      expect(s.steps.length).toBe(t.steps.length);
    }
  });
});

describe("templateIdOf", () => {
  it("reads the templateId off campaignConfig", () => {
    expect(templateIdOf({ templateId: "post-funding", triggerSignalTypes: ["post_funding"] })).toBe("post-funding");
  });
  it("returns null when absent or malformed", () => {
    expect(templateIdOf(null)).toBeNull();
    expect(templateIdOf({})).toBeNull();
    expect(templateIdOf({ templateId: 42 } as unknown as Record<string, unknown>)).toBeNull();
  });
});
