import { describe, expect, it, beforeEach } from "vitest";
import { ingestRelations, type IngestDeps } from "@/lib/connection-graph/ingest";
import { MockGraphProvider } from "@/lib/connection-graph/provider/mock";
import { resolveCompany } from "@/lib/connection-graph/company-resolution";
import type { ConnectionEdge, RawRelation } from "@/lib/connection-graph/types";

const candidates = [
  { id: "acme", name: "Acme Inc", domain: "acme.com" },
  { id: "globex", name: "Globex", domain: "globex.com" },
];

function makeRelations(n: number): RawRelation[] {
  return Array.from({ length: n }, (_, i) => ({
    externalId: `p${i}`,
    name: `Person ${i}`,
    companyName: i % 2 === 0 ? "Acme Inc" : "Unknown Co",
    companyDomain: i % 2 === 0 ? "acme.com" : null,
    networkDistance: "DISTANCE_1",
  }));
}

function makeDeps(provider: MockGraphProvider) {
  const store = new Map<string, ConnectionEdge>();
  const cursors: Array<string | null> = [];
  const deps: IngestDeps = {
    listRelations: (cursor) => provider.listRelations("acct", cursor),
    resolveCompany: (raw) => resolveCompany(raw, candidates),
    upsertEdges: async (edges) => {
      for (const e of edges) store.set(e.personExternalId, e);
    },
    saveCursor: async (c) => {
      cursors.push(c);
    },
  };
  return { deps, store, cursors };
}

describe("ingestRelations", () => {
  let provider: MockGraphProvider;

  beforeEach(() => {
    provider = new MockGraphProvider({ relations: makeRelations(120), pageSize: 50 });
  });

  it("drips all pages, resolves companies, upserts normalised edges", async () => {
    const { deps, store } = makeDeps(provider);
    const res = await ingestRelations(
      { ownerUserId: "u1", tenantId: "t1", source: "mock", maxPages: 10 },
      deps,
    );
    expect(res.stoppedReason).toBe("completed");
    expect(res.pages).toBe(3); // 120 / 50 → 50,50,20
    expect(res.edges).toBe(120);
    expect(res.resolved).toBe(60); // even indices resolve to acme
    expect(store.size).toBe(120);
    const sample = store.get("p0")!;
    expect(sample.resolvedCompanyId).toBe("acme");
    expect(sample.networkDistance).toBe("first");
    expect(sample.tenantId).toBe("t1");
  });

  it("stops at maxPages and reports the resume cursor", async () => {
    const { deps } = makeDeps(provider);
    const res = await ingestRelations(
      { ownerUserId: "u1", tenantId: "t1", source: "mock", maxPages: 1 },
      deps,
    );
    expect(res.stoppedReason).toBe("max_pages");
    expect(res.pages).toBe(1);
    expect(res.edges).toBe(50);
    expect(res.nextCursor).toBe("50");
  });

  it("stops cleanly when the provider signals a rate limit and persists the cursor", async () => {
    provider = new MockGraphProvider({
      relations: makeRelations(120),
      pageSize: 50,
      rateLimitAtPage: 1, // page 0 ok, page 1 → rate limited
    });
    const { deps, cursors } = makeDeps(provider);
    const res = await ingestRelations(
      { ownerUserId: "u1", tenantId: "t1", source: "mock", maxPages: 10 },
      deps,
    );
    expect(res.stoppedReason).toBe("rate_limited");
    expect(res.pages).toBe(2);
    expect(res.edges).toBe(50);
    expect(cursors[cursors.length - 1]).toBe("50"); // resume point saved
  });

  it("resumes from a start cursor", async () => {
    const { deps, store } = makeDeps(provider);
    const res = await ingestRelations(
      { ownerUserId: "u1", tenantId: "t1", source: "mock", startCursor: "100", maxPages: 10 },
      deps,
    );
    expect(res.edges).toBe(20); // only the last 20
    expect(store.has("p110")).toBe(true);
    expect(store.has("p0")).toBe(false);
  });

  it("skips rows with no stable external id", async () => {
    const bad = new MockGraphProvider({
      relations: [
        { externalId: "", name: "Ghost" },
        { externalId: "real", name: "Real", companyDomain: "globex.com" },
      ],
      pageSize: 50,
    });
    const { deps, store } = makeDeps(bad);
    const res = await ingestRelations(
      { ownerUserId: "u1", tenantId: "t1", source: "mock" },
      deps,
    );
    expect(res.edges).toBe(1);
    expect(store.get("real")!.resolvedCompanyId).toBe("globex");
  });
});
