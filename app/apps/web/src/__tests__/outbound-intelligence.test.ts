import { describe, it, expect } from "vitest";
import {
  METHODOLOGIES,
  SIGNAL_ANGLES,
  STEP_STRATEGIES,
  getMethodology,
  pickBestSignal,
} from "@/lib/outbound-methodologies";

describe("Outbound Methodology Library", () => {
  it("covers all seniority levels", () => {
    const levels = ["c-suite", "vp", "head", "director", "manager", "senior", "entry", "founder", "owner", "partner"];
    for (const level of levels) {
      expect(METHODOLOGIES[level]).toBeDefined();
      expect(METHODOLOGIES[level].name).toBeTruthy();
      expect(METHODOLOGIES[level].maxWords).toBeGreaterThan(0);
    }
  });

  it("getMethodology returns correct methodology for known seniority", () => {
    expect(getMethodology("c-suite").name).toBe("BASHO");
    expect(getMethodology("vp").name).toBe("Challenger");
    expect(getMethodology("director").name).toBe("Problem-Solution");
    expect(getMethodology("senior").name).toBe("Product-Led");
  });

  it("getMethodology returns safe default for unknown seniority", () => {
    expect(getMethodology(null).name).toBe("Problem-Solution");
    expect(getMethodology("unknown_role").name).toBe("Problem-Solution");
  });

  it("each methodology has complete structure", () => {
    for (const [key, m] of Object.entries(METHODOLOGIES)) {
      expect(m.name).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.structure).toBeTruthy();
      expect(m.toneNotes).toBeTruthy();
      expect(m.ctaType).toBeTruthy();
      expect(m.whatNotToDo.length).toBeGreaterThan(0);
      expect(m.maxWords).toBeGreaterThan(0);
    }
  });
});

describe("Signal Angles", () => {
  it("covers all signal types", () => {
    const types = ["funding", "hiring", "tech_change", "expansion", "leadership_change", "news"];
    for (const type of types) {
      expect(SIGNAL_ANGLES[type]).toBeDefined();
      expect(SIGNAL_ANGLES[type].angleTemplate).toBeTruthy();
      expect(SIGNAL_ANGLES[type].businessImplication).toBeTruthy();
      expect(SIGNAL_ANGLES[type].questionSeed).toBeTruthy();
    }
  });
});

describe("Step Strategies", () => {
  it("has 5 steps", () => {
    expect(STEP_STRATEGIES).toHaveLength(5);
  });

  it("each step has distinct purpose and name", () => {
    const names = STEP_STRATEGIES.map((s) => s.name);
    expect(new Set(names).size).toBe(5); // all unique

    for (const s of STEP_STRATEGIES) {
      expect(s.purpose).toBeTruthy();
      expect(s.maxWords).toBeGreaterThan(0);
      expect(s.whatNotToDo.length).toBeGreaterThan(0);
    }
  });

  it("delays increase progressively", () => {
    for (let i = 1; i < STEP_STRATEGIES.length; i++) {
      expect(STEP_STRATEGIES[i].delayDays).toBeGreaterThan(0);
    }
  });
});

describe("pickBestSignal", () => {
  it("returns null for empty array", () => {
    expect(pickBestSignal([])).toBeNull();
  });

  it("prefers high relevance funding over low relevance hiring", () => {
    const signals = [
      { type: "hiring", relevance: "low", title: "Hiring", description: "..." },
      { type: "funding", relevance: "high", title: "Series A", description: "..." },
    ];
    const best = pickBestSignal(signals);
    expect(best?.type).toBe("funding");
  });

  it("prefers high relevance of any type over medium relevance", () => {
    const signals = [
      { type: "news", relevance: "medium", title: "News", description: "..." },
      { type: "tech_change", relevance: "high", title: "Tech", description: "..." },
    ];
    const best = pickBestSignal(signals);
    expect(best?.type).toBe("tech_change");
  });
});
