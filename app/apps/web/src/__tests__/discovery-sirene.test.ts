import { describe, it, expect } from "vitest";
import { criteriaToSireneParams } from "@/lib/icp/to-sirene-params";
import { resolveDomain } from "@/lib/discovery/resolve-domain";
import { sireneDiscoverySource } from "@/lib/discovery/sources";
import type { Criterion } from "@/lib/icp/criteria-engine";

const crit = (fieldKey: string, operator: string, value: unknown): Criterion => ({
  id: fieldKey,
  fieldKey,
  operator: operator as Criterion["operator"],
  value,
  weight: 1,
  isRequired: false,
});

describe("criteriaToSireneParams", () => {
  it("maps a French software ICP to NAF + INSEE tranche", () => {
    const t = criteriaToSireneParams([
      crit("geography", "in", ["Île-de-France"]),
      crit("industry", "in", ["computer software"]),
      crit("employee_count", "between", { min: 50, max: 199 }),
    ]);
    expect(t.ok).toBe(true);
    expect((t.params.activite_principale ?? []).length).toBeGreaterThan(0);
    expect(t.params.tranche_effectif_salarie).toContain("21"); // 50-99
    expect(t.params.tranche_effectif_salarie).toContain("22"); // 100-199
  });

  it("skips a non-French ICP", () => {
    const t = criteriaToSireneParams([
      crit("geography", "in", ["Switzerland"]),
      crit("industry", "in", ["computer software"]),
    ]);
    expect(t.ok).toBe(false);
  });

  it("skips a French ICP with no NAF-mappable industry", () => {
    const t = criteriaToSireneParams([
      crit("geography", "in", ["Bretagne"]),
      crit("industry", "in", ["underwater basket weaving"]),
    ]);
    expect(t.ok).toBe(false);
  });
});

describe("resolveDomain (domain-resolution bridge)", () => {
  it("passes through an existing domain, normalized", async () => {
    expect(await resolveDomain({ domain: "https://www.Acme.com/x" })).toBe("acme.com");
  });

  it("returns null for a SIREN when no resolver is available", async () => {
    // PAPPERS_API_KEY unset (or network blocked) → unresolved, not a throw.
    expect(await resolveDomain({ siren: "123456789" })).toBeNull();
  });
});

describe("sireneDiscoverySource", () => {
  it("returns [] for a non-French ICP without hitting the network", async () => {
    const out = await sireneDiscoverySource.search({
      tenantId: "t1",
      icpName: "Swiss",
      criteria: [],
      limit: 10,
    });
    expect(out).toEqual([]);
  });
});
