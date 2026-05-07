import { describe, it, expect } from "vitest";
import {
  getPhaseSchema,
  phase1Schema,
  phase2Schema,
  phase4Schema,
  phase5Schema,
  phase6Schema,
} from "@/lib/onboarding/phase-validators";

describe("phase-validators", () => {
  it("getPhaseSchema returns the right schema per phase", () => {
    for (let n = 1; n <= 7; n++) {
      expect(getPhaseSchema(n)).not.toBeNull();
    }
    expect(getPhaseSchema(0)).toBeNull();
    expect(getPhaseSchema(8)).toBeNull();
  });

  describe("phase 1 — diagnostic", () => {
    it("accepts a complete payload", () => {
      const ok = phase1Schema.safeParse({
        situation: "founder_solo",
        dealsToDate: 3,
        currentStack: ["Hubspot", "Apollo"],
        icp: {
          industry: "Devtools",
          sizeRange: "11-50",
          buyerPersona: "Head of Engineering",
          raw: "VC-backed devtools 11-50 selling to Head of Engineering",
        },
      });
      expect(ok.success).toBe(true);
    });

    it("rejects ICP missing buyer persona", () => {
      const bad = phase1Schema.safeParse({
        situation: "founder_solo",
        dealsToDate: 0,
        icp: {
          industry: "Devtools",
          sizeRange: "11-50",
          buyerPersona: "",
          raw: "missing buyer persona forced too short",
        },
      });
      expect(bad.success).toBe(false);
    });
  });

  describe("phase 2 — ICP & TAM", () => {
    it("accepts at least one best customer + anti-ICP", () => {
      const ok = phase2Schema.safeParse({
        bestCustomers: ["Stripe"],
        antiIcp: ["BigCo Inc"],
      });
      expect(ok.success).toBe(true);
    });

    it("rejects empty arrays", () => {
      const bad = phase2Schema.safeParse({ bestCustomers: [], antiIcp: [] });
      expect(bad.success).toBe(false);
    });
  });

  describe("phase 4 — signals", () => {
    it("requires ≥3 custom signals", () => {
      const bad = phase4Schema.safeParse({
        customSignals: [
          { question: "Hiring a Head of Growth?", rationale: "Mature buying" },
          { question: "Common investor with us?", rationale: "Warm intro" },
        ],
      });
      expect(bad.success).toBe(false);
    });

    it("accepts 3 signals", () => {
      const ok = phase4Schema.safeParse({
        customSignals: [
          { question: "Hiring a Head of Growth?", rationale: "Mature buying" },
          { question: "Common investor with us?", rationale: "Warm intro" },
          { question: "Using competitor X currently?", rationale: "Switch trigger" },
        ],
      });
      expect(ok.success).toBe(true);
    });
  });

  describe("phase 5 — voice & sequences", () => {
    it("accepts 5 emails as voice samples", () => {
      const ok = phase5Schema.safeParse({
        voiceSamples: { emails: ["a", "b", "c", "d", "e"] },
        approvedSequenceIds: ["seq-1"],
      });
      expect(ok.success).toBe(true);
    });

    it("accepts a loom URL when emails are insufficient", () => {
      const ok = phase5Schema.safeParse({
        voiceSamples: { emails: ["a"], loomUrl: "https://www.loom.com/share/abc" },
        approvedSequenceIds: ["seq-1"],
      });
      expect(ok.success).toBe(true);
    });

    it("rejects when neither emails ≥5 nor loom is present", () => {
      const bad = phase5Schema.safeParse({
        voiceSamples: { emails: ["only one"] },
        approvedSequenceIds: ["seq-1"],
      });
      expect(bad.success).toBe(false);
    });

    it("rejects zero approved sequences", () => {
      const bad = phase5Schema.safeParse({
        voiceSamples: { emails: ["a", "b", "c", "d", "e"] },
        approvedSequenceIds: [],
      });
      expect(bad.success).toBe(false);
    });
  });

  describe("phase 6 — pipeline", () => {
    it("requires ≥3 stages", () => {
      const bad = phase6Schema.safeParse({
        stages: [
          { id: "lead", name: "Lead" },
          { id: "demo", name: "Demo" },
        ],
        confirmedAt: new Date().toISOString(),
      });
      expect(bad.success).toBe(false);
    });
  });
});
