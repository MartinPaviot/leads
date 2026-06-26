import { describe, it, expect } from "vitest";
import { KNOWN_SIGNAL_TYPES } from "@/lib/sequences/triggers";
import {
  PROVEN_TEMPLATES,
  getTemplate,
  templatesForTrigger,
  uncoveredSignalTypes,
  validateCatalog,
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
    expect(validateCatalog([t])).toContainEqual({ templateId: "x", problem: "step 1 uses unsupported var {{companyName}}" });
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
