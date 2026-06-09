import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/recherche-entreprises-client", () => ({
  isSireneAvailable: () => true,
  enrichCompanyByNameSirene: vi.fn(),
}));

import { enrichCompanyByNameSirene } from "@/lib/integrations/recherche-entreprises-client";
import { sireneCompanyEnrichmentProvider } from "@/lib/providers/company-enrichment/sirene-adapter";

const ctx = { tenantId: "t1" };

function hit(over: Partial<Awaited<ReturnType<typeof enrichCompanyByNameSirene>>> = {}) {
  return {
    siren: "794598813", name: "DOCTOLIB", naf: "62.01Z", section: "J",
    effectifTranche: "42", foundedYear: 2013, city: "LEVALLOIS-PERRET",
    postalCode: "92300", departement: "92", ca: 311448000, caYear: "2024", exact: true,
    ...over,
  };
}

describe("sirene company-enrichment adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps an exact SIRENE match to normalized firmographics", async () => {
    vi.mocked(enrichCompanyByNameSirene).mockResolvedValue(hit());
    const r = await sireneCompanyEnrichmentProvider.enrich({ name: "Doctolib" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("sirene");
    expect(r.data?.industry).toBe("Information et communication"); // NAF section J
    expect(r.data?.sizeRange).toBe("1000-1999"); // tranche 42
    expect(r.data?.annualRevenue).toBe(311448000);
    expect(r.data?.foundedYear).toBe(2013);
    expect(r.data?.city).toBe("LEVALLOIS-PERRET");
    expect(r.data?.country).toBe("France");
    expect(r.costCents).toBe(0); // keyless
  });

  it("rejects a non-exact name match (false-positive guard)", async () => {
    vi.mocked(enrichCompanyByNameSirene).mockResolvedValue(hit({ exact: false }));
    const r = await sireneCompanyEnrichmentProvider.enrich({ name: "Qonto" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });

  it("returns ok:false when SIRENE has no result", async () => {
    vi.mocked(enrichCompanyByNameSirene).mockResolvedValue(null);
    const r = await sireneCompanyEnrichmentProvider.enrich({ name: "Nope SARL" }, ctx);
    expect(r.ok).toBe(false);
  });

  it("requires a name", async () => {
    const r = await sireneCompanyEnrichmentProvider.enrich({ domain: "x.fr" }, ctx);
    expect(r.ok).toBe(false);
    expect(enrichCompanyByNameSirene).not.toHaveBeenCalled();
  });

  it("falls back to the NAF code when the section is unknown", async () => {
    vi.mocked(enrichCompanyByNameSirene).mockResolvedValue(hit({ section: null }));
    const r = await sireneCompanyEnrichmentProvider.enrich({ name: "Doctolib" }, ctx);
    expect(r.data?.industry).toBe("62.01Z");
  });

  it("tolerates missing finances / size", async () => {
    vi.mocked(enrichCompanyByNameSirene).mockResolvedValue(hit({ ca: null, effectifTranche: null }));
    const r = await sireneCompanyEnrichmentProvider.enrich({ name: "Doctolib" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.data?.annualRevenue).toBeNull();
    expect(r.data?.sizeRange).toBeNull();
  });
});
