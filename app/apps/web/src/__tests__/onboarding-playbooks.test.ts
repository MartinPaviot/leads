import { describe, it, expect } from "vitest";
import {
  resolvePlaybook,
  PLAYBOOKS,
  type PlaybookSlug,
} from "@/lib/onboarding/playbooks";

describe("resolvePlaybook", () => {
  it("returns b2b-saas-ops as fallback for null/empty input", () => {
    expect(resolvePlaybook(null).slug).toBe("b2b-saas-ops");
    expect(resolvePlaybook(undefined).slug).toBe("b2b-saas-ops");
    expect(resolvePlaybook("").slug).toBe("b2b-saas-ops");
  });

  it("matches devtools keywords", () => {
    expect(resolvePlaybook("Developer tools").slug).toBe("devtools");
    expect(resolvePlaybook("CI/CD platform").slug).toBe("devtools");
    expect(resolvePlaybook("observability infra").slug).toBe("devtools");
  });

  it("matches fintech keywords", () => {
    expect(resolvePlaybook("fintech").slug).toBe("fintech");
    expect(resolvePlaybook("payments platform").slug).toBe("fintech");
    expect(resolvePlaybook("embedded finance").slug).toBe("fintech");
  });

  it("matches healthtech keywords", () => {
    expect(resolvePlaybook("digital health").slug).toBe("healthtech");
    expect(resolvePlaybook("EHR integration").slug).toBe("healthtech");
    expect(resolvePlaybook("telemedicine").slug).toBe("healthtech");
  });

  it("matches ecommerce keywords", () => {
    expect(resolvePlaybook("Shopify app").slug).toBe("ecommerce");
    expect(resolvePlaybook("DTC SaaS").slug).toBe("ecommerce");
    expect(resolvePlaybook("post-purchase").slug).toBe("ecommerce");
  });

  it("falls back to b2b-saas-ops for unrelated industries", () => {
    expect(resolvePlaybook("manufacturing widgets").slug).toBe("b2b-saas-ops");
  });

  it("is case-insensitive", () => {
    expect(resolvePlaybook("DEVTOOLS").slug).toBe("devtools");
    expect(resolvePlaybook("FinTech").slug).toBe("fintech");
  });
});

describe("playbook contents", () => {
  it("every playbook has 5 signals, 3 sequences, ≥3 stages", () => {
    for (const slug of Object.keys(PLAYBOOKS) as PlaybookSlug[]) {
      const p = PLAYBOOKS[slug];
      expect(p.signals).toHaveLength(5);
      expect(p.sequences).toHaveLength(3);
      expect(p.defaultStages.length).toBeGreaterThanOrEqual(3);
      expect(p.label.length).toBeGreaterThan(5);
    }
  });

  it("signal keys are unique within a playbook", () => {
    for (const slug of Object.keys(PLAYBOOKS) as PlaybookSlug[]) {
      const keys = PLAYBOOKS[slug].signals.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("sequence keys are unique within a playbook", () => {
    for (const slug of Object.keys(PLAYBOOKS) as PlaybookSlug[]) {
      const keys = PLAYBOOKS[slug].sequences.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
