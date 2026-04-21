import { beforeEach, describe, expect, it } from "vitest";
import {
  enrichCompany,
  registerProvider,
  resetRegistryForTest,
  type CompanyEnrichmentProvider,
  type EnrichResult,
} from "@/lib/providers/company-enrichment";

function mockProvider(
  name: string,
  opts: {
    priority?: number;
    available?: boolean;
    result?: Omit<EnrichResult, "provider" | "durationMs">;
    throws?: string;
    costCentsPerCall?: number;
  },
): CompanyEnrichmentProvider {
  return {
    name,
    priority: opts.priority ?? 10,
    costCentsPerCall: opts.costCentsPerCall ?? 0,
    isAvailable: () => opts.available ?? true,
    async enrich() {
      if (opts.throws) throw new Error(opts.throws);
      const r = opts.result ?? { ok: false, data: null, costCents: 0 };
      return { ...r, provider: name, durationMs: 1 };
    },
  };
}

describe("company-enrichment waterfall", () => {
  beforeEach(() => {
    resetRegistryForTest();
  });

  it("returns empty result when no providers registered", async () => {
    const res = await enrichCompany(
      { domain: "acme.com" },
      { tenantId: "t1" },
      { overrideProviders: [] },
    );
    expect(res.enriched).toBe(false);
    expect(res.provenance).toHaveLength(0);
    expect(res.attempts).toHaveLength(0);
    expect(res.totalCostCents).toBe(0);
    expect(res.data.industry).toBeNull();
  });

  it("single-provider success populates data + provenance", async () => {
    registerProvider(
      mockProvider("apollo", {
        result: {
          ok: true,
          costCents: 0,
          data: {
            domain: "acme.com",
            name: "Acme",
            industry: "SaaS",
            description: "A test company",
            employeeCount: 50,
            technologies: ["Node.js", "React"],
          },
        },
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(res.enriched).toBe(true);
    expect(res.data.industry).toBe("SaaS");
    expect(res.data.employeeCount).toBe(50);
    expect(res.data.technologies).toEqual(["Node.js", "React"]);
    expect(res.provenance.every((p) => p.provider === "apollo")).toBe(true);
    expect(res.provenance.some((p) => p.field === "industry")).toBe(true);
    expect(res.provenance.some((p) => p.field === "technologies")).toBe(true);
    expect(res.totalCostCents).toBe(0);
  });

  it("saturation — breaks early when primary already has industry + description + size", async () => {
    let llmCalled = false;
    registerProvider(
      mockProvider("apollo", {
        priority: 10,
        result: {
          ok: true,
          costCents: 0,
          data: {
            industry: "SaaS",
            description: "great tool",
            sizeRange: "11-50",
          },
        },
      }),
    );
    registerProvider({
      name: "llm-fallback",
      priority: 100,
      costCentsPerCall: 2,
      isAvailable: () => true,
      async enrich() {
        llmCalled = true;
        return {
          ok: true,
          data: { industry: "Other", description: "…", sizeRange: "…" },
          provider: "llm-fallback",
          durationMs: 1,
          costCents: 2,
        };
      },
    });
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(llmCalled).toBe(false);
    expect(res.totalCostCents).toBe(0);
    expect(res.data.industry).toBe("SaaS");
  });

  it("merges partial results across providers (primary has industry, secondary fills linkedinUrl)", async () => {
    registerProvider(
      mockProvider("primary", {
        priority: 10,
        result: {
          ok: true,
          costCents: 0,
          data: {
            industry: "SaaS",
            description: null,
            employeeCount: 100,
          },
        },
      }),
    );
    registerProvider(
      mockProvider("secondary", {
        priority: 50,
        result: {
          ok: true,
          costCents: 0,
          data: {
            description: "filled in by secondary",
            linkedinUrl: "https://linkedin.com/company/acme",
            industry: "wrong — should not overwrite",
          },
        },
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(res.data.industry).toBe("SaaS"); // primary wins
    expect(res.data.description).toBe("filled in by secondary");
    expect(res.data.linkedinUrl).toBe("https://linkedin.com/company/acme");
    const industryProvenance = res.provenance.find((p) => p.field === "industry");
    expect(industryProvenance?.provider).toBe("primary");
    const descProvenance = res.provenance.find((p) => p.field === "description");
    expect(descProvenance?.provider).toBe("secondary");
  });

  it("array fields union + dedupe across providers", async () => {
    registerProvider(
      mockProvider("primary", {
        priority: 10,
        result: {
          ok: true,
          costCents: 0,
          data: { technologies: ["React", "Node.js"], description: "X" },
        },
      }),
    );
    registerProvider(
      mockProvider("secondary", {
        priority: 50,
        result: {
          ok: true,
          costCents: 0,
          data: { technologies: ["Node.js", "PostgreSQL"], sizeRange: "11-50", industry: "SaaS" },
        },
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(res.data.technologies.sort()).toEqual(["Node.js", "PostgreSQL", "React"]);
  });

  it("primary throws — waterfall captures error and falls through to secondary", async () => {
    registerProvider(
      mockProvider("apollo", {
        priority: 10,
        throws: "network timeout",
      }),
    );
    registerProvider(
      mockProvider("llm-fallback", {
        priority: 100,
        costCentsPerCall: 2,
        result: {
          ok: true,
          costCents: 2,
          data: { industry: "SaaS", description: "LLM said so", sizeRange: "11-50" },
        },
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(res.data.industry).toBe("SaaS");
    expect(res.attempts).toHaveLength(2);
    expect(res.attempts[0].ok).toBe(false);
    expect(res.attempts[0].error).toContain("network timeout");
    expect(res.attempts[1].ok).toBe(true);
    expect(res.totalCostCents).toBe(2);
  });

  it("respects isAvailable — unavailable providers are skipped silently", async () => {
    let called = false;
    registerProvider(
      mockProvider("disabled", {
        priority: 10,
        available: false,
        result: {
          ok: true,
          costCents: 0,
          data: { industry: "should-not-appear" },
        },
      }),
    );
    registerProvider({
      name: "enabled",
      priority: 50,
      costCentsPerCall: 0,
      isAvailable: () => true,
      async enrich() {
        called = true;
        return {
          ok: true,
          data: { industry: "SaaS", description: "ok", sizeRange: "11-50" },
          provider: "enabled",
          durationMs: 1,
          costCents: 0,
        };
      },
    });
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(called).toBe(true);
    expect(res.data.industry).toBe("SaaS");
  });

  it("all providers fail — returns empty data with attempts for diagnosis", async () => {
    registerProvider(
      mockProvider("p1", {
        priority: 10,
        result: { ok: false, costCents: 0, data: null, error: "no match" },
      }),
    );
    registerProvider(
      mockProvider("p2", {
        priority: 50,
        throws: "boom",
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(res.enriched).toBe(false);
    expect(res.attempts).toHaveLength(2);
    expect(res.attempts.every((a) => !a.ok)).toBe(true);
    expect(res.data.industry).toBeNull();
  });

  it("sums cost across all attempted providers (even when saturation stops the chain)", async () => {
    registerProvider(
      mockProvider("p1", {
        priority: 10,
        costCentsPerCall: 1,
        result: { ok: true, costCents: 1, data: { industry: "X" } },
      }),
    );
    registerProvider(
      mockProvider("p2", {
        priority: 50,
        costCentsPerCall: 3,
        result: {
          ok: true,
          costCents: 3,
          data: { description: "Y", sizeRange: "11-50" },
        },
      }),
    );
    registerProvider(
      mockProvider("p3", {
        priority: 100,
        costCentsPerCall: 5,
        result: { ok: true, costCents: 5, data: { linkedinUrl: "…" } },
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    // p1 + p2 saturate; p3 should not be called.
    expect(res.attempts.map((a) => a.provider)).toEqual(["p1", "p2"]);
    expect(res.totalCostCents).toBe(4);
  });

  it("provider replacement — registering a new provider with same name replaces the old one", async () => {
    registerProvider(
      mockProvider("apollo", {
        result: { ok: true, costCents: 0, data: { industry: "old" } },
      }),
    );
    registerProvider(
      mockProvider("apollo", {
        result: {
          ok: true,
          costCents: 0,
          data: { industry: "new", description: "…", sizeRange: "…" },
        },
      }),
    );
    const res = await enrichCompany({ domain: "acme.com" }, { tenantId: "t1" });
    expect(res.data.industry).toBe("new");
    expect(res.attempts).toHaveLength(1);
  });
});
