import { describe, it, expect, beforeEach } from "vitest";
import {
  registerDiscoverySource,
  listDiscoverySources,
  listAvailableDiscoverySources,
  resetDiscoveryRegistryForTest,
} from "@/lib/discovery/registry";
import { candidateToAddPayload, type DiscoverySource } from "@/lib/discovery/types";
import { pappersDiscoverySource } from "@/lib/discovery/sources";

function fakeSource(name: string, priority: number, available: boolean): DiscoverySource {
  return {
    name,
    priority,
    costCentsPerCall: 0,
    isAvailable: () => available,
    search: async () => [],
  };
}

describe("discovery registry", () => {
  beforeEach(() => resetDiscoveryRegistryForTest());

  it("orders sources by priority (lowest first)", () => {
    registerDiscoverySource(fakeSource("b", 20, true));
    registerDiscoverySource(fakeSource("a", 10, true));
    expect(listDiscoverySources().map((s) => s.name)).toEqual(["a", "b"]);
  });

  it("filters out unavailable sources", () => {
    registerDiscoverySource(fakeSource("on", 10, true));
    registerDiscoverySource(fakeSource("off", 20, false));
    expect(listAvailableDiscoverySources().map((s) => s.name)).toEqual(["on"]);
  });
});

describe("candidateToAddPayload", () => {
  it("maps a candidate (with a SIREN native id) into an add payload", () => {
    const p = candidateToAddPayload({
      sourceName: "pappers",
      name: "Acme SA",
      domain: "acme.fr",
      nativeId: "123456789",
      nativeIdType: "siren",
      industry: "Conseil",
      employeeCount: null,
      country: "France",
    });
    expect(p).toMatchObject({
      name: "Acme SA",
      domain: "acme.fr",
      industry: "Conseil",
      source: "pappers",
    });
    const props = p.properties as Record<string, unknown>;
    expect(props.siren_id).toBe("123456789");
    expect(props.native_ids).toEqual({ siren: "123456789" });
  });

  it("falls back to domain for name", () => {
    const p = candidateToAddPayload({
      sourceName: "apollo",
      name: null,
      domain: "foo.com",
      nativeId: "a1",
      nativeIdType: "apollo",
      industry: null,
      employeeCount: 50,
      country: null,
    });
    expect(p.name).toBe("foo.com");
  });
});

describe("pappersDiscoverySource", () => {
  it("returns [] for a non-French ICP without calling the API", async () => {
    const out = await pappersDiscoverySource.search({
      tenantId: "t1",
      icpName: "Swiss SaaS",
      criteria: [],
      limit: 10,
    });
    expect(out).toEqual([]);
  });
});
