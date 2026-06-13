import { describe, expect, it } from "vitest";
import {
  normalizeNetworkDistance,
  isFirstDegree,
} from "@/lib/connection-graph/network-distance";
import {
  resolveCompany,
  normalizeDomain,
} from "@/lib/connection-graph/company-resolution";
import {
  computeIcpOverlay,
  countWarmIcpAccounts,
} from "@/lib/connection-graph/icp-overlay";
import {
  computeAccountWarmPath,
  computeContactIntroPath,
  bestWarmPath,
} from "@/lib/connection-graph/warm-path";
import type {
  CompanyFit,
  ConnectionEdge,
} from "@/lib/connection-graph/types";

function edge(over: Partial<ConnectionEdge> = {}): ConnectionEdge {
  return {
    ownerUserId: "u1",
    tenantId: "t1",
    personExternalId: over.personExternalId ?? "p1",
    personName: over.personName ?? "Alice Martin",
    personHeadline: over.personHeadline ?? null,
    rawCompanyName: over.rawCompanyName ?? null,
    rawCompanyDomain: over.rawCompanyDomain ?? null,
    resolvedCompanyId: over.resolvedCompanyId ?? null,
    networkDistance: over.networkDistance ?? "first",
    sharedConnectionsCount: over.sharedConnectionsCount ?? 0,
    source: over.source ?? "mock",
  };
}

describe("normalizeNetworkDistance", () => {
  it("maps provider strings, integers, and our own enum", () => {
    expect(normalizeNetworkDistance("DISTANCE_1")).toBe("first");
    expect(normalizeNetworkDistance("DISTANCE_2")).toBe("second");
    expect(normalizeNetworkDistance("DISTANCE_3")).toBe("third");
    expect(normalizeNetworkDistance("OUT_OF_NETWORK")).toBe("out_of_network");
    expect(normalizeNetworkDistance(1)).toBe("first");
    expect(normalizeNetworkDistance("first")).toBe("first");
  });

  it("fails safe to out_of_network on null / junk", () => {
    expect(normalizeNetworkDistance(null)).toBe("out_of_network");
    expect(normalizeNetworkDistance(undefined)).toBe("out_of_network");
    expect(normalizeNetworkDistance("???")).toBe("out_of_network");
    expect(normalizeNetworkDistance(9)).toBe("out_of_network");
    expect(isFirstDegree("first")).toBe(true);
    expect(isFirstDegree("second")).toBe(false);
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, path, mailto", () => {
    expect(normalizeDomain("https://www.Acme.com/careers")).toBe("acme.com");
    expect(normalizeDomain("jane@acme.com")).toBe("acme.com");
    expect(normalizeDomain("ACME.com.")).toBe("acme.com");
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });
});

describe("resolveCompany", () => {
  const candidates = [
    { id: "c1", name: "Société Générale", domain: "socgen.com" },
    { id: "c2", name: "Acme Inc", domain: "acme.com" },
  ];

  it("matches on domain first (diacritic/case/www tolerant)", () => {
    expect(resolveCompany({ domain: "https://www.acme.com" }, candidates)).toBe("c2");
  });

  it("matches on normalised name when no domain", () => {
    expect(resolveCompany({ name: "societe generale" }, candidates)).toBe("c1");
  });

  it("fails to null rather than fuzzy-guess", () => {
    expect(resolveCompany({ name: "Acme Corporation" }, candidates)).toBeNull();
    expect(resolveCompany({ domain: "unknown.io" }, candidates)).toBeNull();
    expect(resolveCompany({}, candidates)).toBeNull();
  });
});

describe("computeIcpOverlay", () => {
  const fit = new Map<string, CompanyFit>([
    ["c1", { fitScore: 0.9, icpId: "icp1" }],
    ["c2", { fitScore: 0.6, icpId: "icp1" }],
    ["c3", { fitScore: 0.3, icpId: "icp1" }],
  ]);

  it("keeps first-degree, resolved, ICP-fit edges ranked by fit", () => {
    const edges = [
      edge({ personExternalId: "p2", personName: "Bob", resolvedCompanyId: "c2" }),
      edge({ personExternalId: "p1", personName: "Alice", resolvedCompanyId: "c1" }),
    ];
    const out = computeIcpOverlay(edges, fit);
    expect(out.map((a) => a.companyId)).toEqual(["c1", "c2"]);
    expect(out[0].fitScore).toBe(0.9);
  });

  it("drops below-threshold fit, unresolved, and non-first-degree edges", () => {
    const edges = [
      edge({ resolvedCompanyId: "c3" }), // fit 0.3 < 0.5
      edge({ personExternalId: "p9", resolvedCompanyId: null }), // unresolved
      edge({ personExternalId: "p8", networkDistance: "second", resolvedCompanyId: "c1" }),
    ];
    expect(computeIcpOverlay(edges, fit)).toEqual([]);
  });

  it("counts distinct warm ICP accounts", () => {
    const edges = [
      edge({ personExternalId: "p1", resolvedCompanyId: "c1" }),
      edge({ personExternalId: "p2", resolvedCompanyId: "c1" }), // same account
      edge({ personExternalId: "p3", resolvedCompanyId: "c2" }),
    ];
    expect(countWarmIcpAccounts(computeIcpOverlay(edges, fit))).toBe(2);
  });
});

describe("computeAccountWarmPath (insider)", () => {
  it("returns insider with saturating strength when connections work at the account", () => {
    const edges = [
      edge({ personExternalId: "p1", resolvedCompanyId: "acc" }),
      edge({ personExternalId: "p2", resolvedCompanyId: "acc" }),
    ];
    const wp = computeAccountWarmPath("acc", edges);
    expect(wp.kind).toBe("insider");
    expect(wp.strength).toBeCloseTo(0.84, 5);
    expect(wp.connectors).toHaveLength(2);
  });

  it("ignores non-first-degree and other-company edges; none → strength 0", () => {
    const edges = [
      edge({ networkDistance: "second", resolvedCompanyId: "acc" }),
      edge({ personExternalId: "p2", resolvedCompanyId: "other" }),
    ];
    expect(computeAccountWarmPath("acc", edges)).toEqual({
      kind: "none",
      strength: 0,
      connectors: [],
    });
  });
});

describe("computeContactIntroPath", () => {
  const edges = [
    edge({ personExternalId: "m1", personName: "Mutual One" }),
    edge({ personExternalId: "m2", personName: "Mutual Two" }),
  ];

  it("names connectors that are also the founder's own connections", () => {
    const wp = computeContactIntroPath(edges, {
      connectorExternalIds: ["m1", "stranger"],
      count: 2,
    });
    expect(wp.kind).toBe("intro_path");
    expect(wp.connectors.map((c) => c.personExternalId)).toEqual(["m1"]);
    expect(wp.strength).toBeCloseTo(0.3, 5);
  });

  it("degrades to count-based strength when only a count is exposed (free plan)", () => {
    const wp = computeContactIntroPath(edges, { connectorExternalIds: [], count: 3 });
    expect(wp.kind).toBe("intro_path");
    expect(wp.connectors).toEqual([]);
    expect(wp.strength).toBeCloseTo(0.42, 5);
  });

  it("caps intro strength below insider base and returns none at zero", () => {
    const many = computeContactIntroPath(edges, { connectorExternalIds: [], count: 99 });
    expect(many.strength).toBeLessThanOrEqual(0.6);
    expect(computeContactIntroPath(edges, { connectorExternalIds: [], count: 0 }).kind).toBe("none");
  });
});

describe("bestWarmPath", () => {
  it("prefers higher strength, and insider on ties", () => {
    const insider = computeAccountWarmPath("acc", [edge({ resolvedCompanyId: "acc" })]);
    const intro = computeContactIntroPath([edge()], { connectorExternalIds: [], count: 3 });
    expect(bestWarmPath(insider, intro)).toBe(insider); // 0.8 > 0.42
    const introWeak = { kind: "intro_path" as const, strength: 0.8, connectors: [] };
    expect(bestWarmPath(insider, introWeak).kind).toBe("insider"); // tie → insider
  });
});
