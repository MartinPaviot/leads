import { describe, it, expect, vi } from "vitest";
import { sireneToCanonical, pappersToCanonical, zefixToCanonical } from "../map";
import { sourceFromRegistry, enrichFromRegistry } from "../source";
import type { CanonicalRegistryAccount, RegistryDeps, MeterOp } from "../types";
import type { SireneCompany } from "@/lib/integrations/recherche-entreprises-client";
import type { PappersCompany } from "@/lib/integrations/pappers-client";
import type { ZefixFirm } from "@/lib/integrations/zefix-client";

const sirene = (siren: string): SireneCompany => ({
  siren, name: `Co ${siren}`, naf: "62.01Z", libelleNaf: "Programmation", effectifTranche: "21",
  postalCode: "75001", city: "Paris", departement: "75", active: true,
});
const pappers = (siren: string): PappersCompany => ({
  siren, name: `Co ${siren}`, codeNaf: "62.01Z", libelleNaf: "Programmation", website: "co.fr",
  city: "Paris", postalCode: "75001", dateCreation: null,
});
const zefix: ZefixFirm = { uid: "CHE-123.456.789", name: "Swiss Co", canton: "VD", legalForm: "SA", legalSeat: "Lausanne", active: true, purpose: null };

describe("registry -> canonical mappers (AC2/AC3)", () => {
  it("maps SIRENE with legal_id, NAICS, headcount band, address", () => {
    const a = sireneToCanonical(sirene("552100554"));
    expect(a.legalId).toBe("fr:552100554");
    expect(a.naicsCode).toBe("51");
    expect(a.headcountBand).toBe("50-99");
    expect(a.address).toEqual({ city: "Paris", postalCode: "75001", region: "75" });
    expect(a).not.toHaveProperty("effectifTranche"); // no vendor field escapes
  });
  it("maps Pappers (carries domain) and Zefix (ch legal_id)", () => {
    expect(pappersToCanonical(pappers("552100554")).domain).toBe("co.fr");
    const z = zefixToCanonical(zefix);
    expect(z.legalId).toBe("ch:CHE-123.456.789");
    expect(z.country).toBe("CH");
    expect(z.naicsCode).toBeNull(); // Zefix has no NOGA
  });
});

function deps(over: Partial<RegistryDeps> = {}): { deps: RegistryDeps; meterOps: MeterOp[] } {
  const meterOps: MeterOp[] = [];
  return {
    deps: {
      tenantId: "t1",
      meter: over.meter ?? (async (op, fn) => { meterOps.push(op); return fn(); }),
      searchSirene: over.searchSirene,
      fetchPappersBySiren: over.fetchPappersBySiren,
      cache: over.cache,
      upsertAccount: over.upsertAccount,
    },
    meterOps,
  };
}

async function collect(it: AsyncIterable<CanonicalRegistryAccount>) {
  const out: CanonicalRegistryAccount[] = [];
  for await (const a of it) out.push(a);
  return out;
}

describe("sourceFromRegistry (FR, AC1/AC4)", () => {
  it("paginates SIRENE into canonical accounts, meters + persists", async () => {
    const searchSirene = vi.fn(async () => ({ companies: [sirene("1"), sirene("2")] }));
    const upsertAccount = vi.fn(async () => {});
    const { deps: d, meterOps } = deps({ searchSirene, upsertAccount });
    const out = await collect(sourceFromRegistry({ country: "FR", nafCodes: ["62"], volume: 10 }, d));
    expect(out.length).toBe(2);
    expect(out[0].legalId).toBe("fr:1");
    expect(meterOps[0].kind).toBe("registry.sirene");
    expect(upsertAccount).toHaveBeenCalledTimes(2);
  });
  it("does not bulk-source CH (Zefix has no sector filter)", async () => {
    const { deps: d } = deps({ searchSirene: async () => ({ companies: [] }) });
    expect((await collect(sourceFromRegistry({ country: "CH" }, d))).length).toBe(0);
  });
});

describe("enrichFromRegistry (AC4/AC5)", () => {
  it("is cache-first: a hit skips the fetch + meter", async () => {
    const cached = sireneToCanonical(sirene("999"));
    const fetchPappersBySiren = vi.fn();
    const { deps: d, meterOps } = deps({
      cache: { get: async () => cached, set: async () => {} },
      fetchPappersBySiren,
    });
    const r = await enrichFromRegistry("fr:999", d);
    expect(r).toBe(cached);
    expect(fetchPappersBySiren).not.toHaveBeenCalled();
    expect(meterOps).toHaveLength(0);
  });
  it("fetches by SIREN on a miss, maps, caches, and meters", async () => {
    const fetchPappersBySiren = vi.fn(async () => pappers("552100554"));
    const set = vi.fn(async () => {});
    const { deps: d, meterOps } = deps({ cache: { get: async () => null, set }, fetchPappersBySiren });
    const r = await enrichFromRegistry("fr:552100554", d);
    expect(r?.legalId).toBe("fr:552100554");
    expect(fetchPappersBySiren).toHaveBeenCalledWith("552100554");
    expect(set).toHaveBeenCalled();
    expect(meterOps[0].kind).toBe("registry.enrich");
  });
});
