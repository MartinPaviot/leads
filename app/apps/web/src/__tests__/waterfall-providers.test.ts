import { describe, it, expect, beforeEach } from "vitest";
import {
  resetRegistryForTest,
  registerProvider,
  listAvailableProviders,
} from "@/lib/providers/company-enrichment/registry";
import { enrichCompany } from "@/lib/providers/company-enrichment/waterfall";
import type {
  CompanyEnrichmentProvider,
  EnrichInput,
  GeoRegion,
  ProviderContext,
} from "@/lib/providers/company-enrichment/types";

function makeProvider(
  name: string,
  priority: number,
  data: Record<string, unknown>,
  available = true,
  geoAffinity?: GeoRegion[],
): CompanyEnrichmentProvider {
  return {
    name,
    priority,
    costCentsPerCall: 0,
    isAvailable: () => available,
    geoAffinity,
    enrich: async () => ({
      ok: true,
      data: data as any,
      provider: name,
      durationMs: 1,
      costCents: 0,
    }),
  };
}

const CTX: ProviderContext = { tenantId: "test-tenant" };
const INPUT: EnrichInput = { domain: "acme.com", name: "Acme" };

describe("waterfall enrichment", () => {
  beforeEach(() => {
    resetRegistryForTest();
  });

  it("chains providers in priority order", async () => {
    const callOrder: string[] = [];
    const p1: CompanyEnrichmentProvider = {
      name: "first",
      priority: 10,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("first");
        return {
          ok: true,
          data: { industry: "SaaS" },
          provider: "first",
          durationMs: 1,
          costCents: 0,
        };
      },
    };
    const p2: CompanyEnrichmentProvider = {
      name: "second",
      priority: 20,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("second");
        return {
          ok: true,
          data: { fundingStage: "Series A", investors: ["YC", "a16z"] },
          provider: "second",
          durationMs: 1,
          costCents: 0,
        };
      },
    };
    registerProvider(p1);
    registerProvider(p2);

    const result = await enrichCompany(INPUT, CTX);
    expect(callOrder).toEqual(["first", "second"]);
    expect(result.data.industry).toBe("SaaS");
    expect(result.data.fundingStage).toBe("Series A");
    expect(result.data.investors).toEqual(["YC", "a16z"]);
  });

  it("stops early when saturated", async () => {
    const callOrder: string[] = [];
    const saturating: CompanyEnrichmentProvider = {
      name: "saturating",
      priority: 10,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("saturating");
        return {
          ok: true,
          data: {
            industry: "SaaS",
            description: "A SaaS company",
            employeeCount: 50,
          },
          provider: "saturating",
          durationMs: 1,
          costCents: 0,
        };
      },
    };
    const skipped: CompanyEnrichmentProvider = {
      name: "skipped",
      priority: 20,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("skipped");
        return {
          ok: true,
          data: { fundingStage: "Seed" },
          provider: "skipped",
          durationMs: 1,
          costCents: 0,
        };
      },
    };
    registerProvider(saturating);
    registerProvider(skipped);

    const result = await enrichCompany(INPUT, CTX);
    expect(callOrder).toEqual(["saturating"]);
    expect(result.data.fundingStage).toBeNull();
  });

  it("skips unavailable providers gracefully", async () => {
    registerProvider(makeProvider("unavailable", 10, { industry: "SaaS" }, false));
    registerProvider(makeProvider("available", 20, { industry: "Fintech" }));

    const result = await enrichCompany(INPUT, CTX);
    expect(result.data.industry).toBe("Fintech");
    expect(result.provenance[0].provider).toBe("available");
  });

  it("merges investor arrays from multiple providers", async () => {
    registerProvider(
      makeProvider("apollo", 10, {
        industry: "SaaS",
        investors: ["Founders Fund", "YC"],
      }),
    );
    registerProvider(
      makeProvider("crunchbase", 20, {
        description: "A company",
        employeeCount: 100,
        investors: ["YC", "Sequoia", "Accel"],
      }),
    );

    const result = await enrichCompany(INPUT, CTX);
    expect(result.data.investors).toContain("Founders Fund");
    expect(result.data.investors).toContain("Sequoia");
    expect(result.data.investors).toContain("Accel");
    // YC appears in both — deduped
    const ycCount = result.data.investors.filter((i) => i === "YC").length;
    expect(ycCount).toBe(1);
  });

  it("tracks provenance per field", async () => {
    registerProvider(makeProvider("p1", 10, { industry: "SaaS" }));
    registerProvider(makeProvider("p2", 20, { fundingStage: "Series B" }));

    const result = await enrichCompany(INPUT, CTX);
    const industryProv = result.provenance.find((p) => p.field === "industry");
    const fundingProv = result.provenance.find((p) => p.field === "fundingStage");
    expect(industryProv?.provider).toBe("p1");
    expect(fundingProv?.provider).toBe("p2");
  });

  it("routes EU domains to EU-affinity providers first", async () => {
    const callOrder: string[] = [];
    const usProvider: CompanyEnrichmentProvider = {
      name: "apollo",
      priority: 10,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("apollo");
        return { ok: true, data: { industry: "Tech" }, provider: "apollo", durationMs: 1, costCents: 0 };
      },
    };
    const euProvider: CompanyEnrichmentProvider = {
      name: "dropcontact",
      priority: 40,
      costCentsPerCall: 0,
      isAvailable: () => true,
      geoAffinity: ["EU"],
      enrich: async () => {
        callOrder.push("dropcontact");
        return { ok: true, data: { description: "French company" }, provider: "dropcontact", durationMs: 1, costCents: 0 };
      },
    };
    registerProvider(usProvider);
    registerProvider(euProvider);

    // .fr domain → EU geo detected → dropcontact runs before apollo
    const result = await enrichCompany({ domain: "acme.fr", name: "Acme" }, CTX);
    expect(callOrder[0]).toBe("dropcontact");
    expect(callOrder[1]).toBe("apollo");
  });

  it("keeps default order for .com domains (no geo detected)", async () => {
    const callOrder: string[] = [];
    const p1: CompanyEnrichmentProvider = {
      name: "apollo",
      priority: 10,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("apollo");
        return { ok: true, data: { industry: "Tech" }, provider: "apollo", durationMs: 1, costCents: 0 };
      },
    };
    const p2: CompanyEnrichmentProvider = {
      name: "dropcontact",
      priority: 40,
      costCentsPerCall: 0,
      isAvailable: () => true,
      geoAffinity: ["EU"],
      enrich: async () => {
        callOrder.push("dropcontact");
        return { ok: true, data: { description: "A company" }, provider: "dropcontact", durationMs: 1, costCents: 0 };
      },
    };
    registerProvider(p1);
    registerProvider(p2);

    await enrichCompany({ domain: "acme.com", name: "Acme" }, CTX);
    expect(callOrder[0]).toBe("apollo");
  });

  it("routes .com.au domains to AU-affinity providers first", async () => {
    const callOrder: string[] = [];
    const global: CompanyEnrichmentProvider = {
      name: "apollo",
      priority: 10,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("apollo");
        return { ok: true, data: { industry: "Mining" }, provider: "apollo", durationMs: 1, costCents: 0 };
      },
    };
    const auProvider: CompanyEnrichmentProvider = {
      name: "firmable",
      priority: 50,
      costCentsPerCall: 0,
      isAvailable: () => true,
      geoAffinity: ["AU"],
      enrich: async () => {
        callOrder.push("firmable");
        return { ok: true, data: { description: "Aussie company" }, provider: "firmable", durationMs: 1, costCents: 0 };
      },
    };
    registerProvider(global);
    registerProvider(auProvider);

    await enrichCompany({ domain: "acme.com.au", name: "Acme" }, CTX);
    expect(callOrder[0]).toBe("firmable");
  });

  it("respects explicit geo override over domain detection", async () => {
    const callOrder: string[] = [];
    registerProvider({
      name: "apollo",
      priority: 10,
      costCentsPerCall: 0,
      isAvailable: () => true,
      enrich: async () => {
        callOrder.push("apollo");
        return { ok: true, data: { industry: "Tech" }, provider: "apollo", durationMs: 1, costCents: 0 };
      },
    });
    registerProvider({
      name: "eu-provider",
      priority: 40,
      costCentsPerCall: 0,
      isAvailable: () => true,
      geoAffinity: ["EU"],
      enrich: async () => {
        callOrder.push("eu-provider");
        return { ok: true, data: { description: "EU" }, provider: "eu-provider", durationMs: 1, costCents: 0 };
      },
    });

    // .com domain but explicit geo=EU → EU provider runs first
    await enrichCompany({ domain: "acme.com", name: "Acme", geo: "EU" }, CTX);
    expect(callOrder[0]).toBe("eu-provider");
  });
});
