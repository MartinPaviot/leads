import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/zefix-lindas-client", () => ({
  isZefixLindasAvailable: () => true,
  enrichSwissCompanyByNameLindas: vi.fn(),
}));

import { enrichSwissCompanyByNameLindas } from "@/lib/integrations/zefix-lindas-client";
import { zefixLindasCompanyEnrichmentProvider } from "@/lib/providers/company-enrichment/zefix-lindas-adapter";

const ctx = { tenantId: "t1" };

describe("zefix-lindas company-enrichment adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps an exact Zefix match to description + Switzerland", async () => {
    vi.mocked(enrichSwissCompanyByNameLindas).mockResolvedValue({
      uid: "CHE105962823", name: "Rolex SA", legalForm: "0106",
      description: "la fabrication et le commerce de montres",
    });
    const r = await zefixLindasCompanyEnrichmentProvider.enrich({ name: "Rolex SA" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("zefix-lindas");
    expect(r.data?.description).toContain("montres");
    expect(r.data?.country).toBe("Switzerland");
    expect(r.costCents).toBe(0); // keyless
  });

  it("returns ok:false when there is no exact match", async () => {
    vi.mocked(enrichSwissCompanyByNameLindas).mockResolvedValue(null);
    const r = await zefixLindasCompanyEnrichmentProvider.enrich({ name: "Nestlé Suisse SA" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });

  it("requires a name", async () => {
    const r = await zefixLindasCompanyEnrichmentProvider.enrich({ domain: "x.ch" }, ctx);
    expect(r.ok).toBe(false);
    expect(enrichSwissCompanyByNameLindas).not.toHaveBeenCalled();
  });

  it("fails soft when the endpoint throws", async () => {
    vi.mocked(enrichSwissCompanyByNameLindas).mockRejectedValue(new Error("LINDAS 500"));
    const r = await zefixLindasCompanyEnrichmentProvider.enrich({ name: "Zazuko GmbH" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("LINDAS 500");
  });
});
