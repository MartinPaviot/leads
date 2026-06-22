import { describe, it, expect, vi } from "vitest";
import { sourceAccounts, countAccounts, APOLLO_MAX_RESULTS } from "../source";
import { icpQueryToApolloParams } from "../query";
import type { CanonicalICPQuery, SourceDeps, SourcedAccount, MeterOp } from "../types";
import type { OrgSearchOrganization, OrgSearchParams, OrgSearchResult } from "@/lib/integrations/apollo-client";

function org(i: number): OrgSearchOrganization {
  return {
    id: `org_${i}`, name: `Co ${i}`, website_url: `https://co${i}.fr`, linkedin_url: null,
    primary_domain: `co${i}.fr`, industry: "Computer Software", keywords: ["saas"],
    estimated_num_employees: 120, annual_revenue: null, total_funding: null, total_funding_printed: null,
    latest_funding_stage: null, founded_year: null, technology_names: ["Next.js"], city: null, state: null,
    country: "France", description: null, logo_url: null,
  };
}

function stub(pages: OrgSearchOrganization[][], total: number) {
  const calls: OrgSearchParams[] = [];
  const searchOrgs = async (params: OrgSearchParams): Promise<OrgSearchResult> => {
    calls.push(params);
    const page = params.page ?? 1;
    const orgs = params.per_page === 1 ? [] : pages[page - 1] ?? [];
    return { organizations: orgs, pagination: { page, per_page: params.per_page ?? 100, total_entries: total } };
  };
  return { searchOrgs, calls };
}

function deps(over: Partial<SourceDeps> & Pick<SourceDeps, "searchOrgs">): { deps: SourceDeps; meterOps: MeterOp[] } {
  const meterOps: MeterOp[] = [];
  return {
    deps: {
      tenantId: "t1",
      searchOrgs: over.searchOrgs,
      meter: over.meter ?? (async (op, fn) => { meterOps.push(op); return fn(); }),
      upsertAccount: over.upsertAccount,
    },
    meterOps,
  };
}

async function collect(it: AsyncIterable<SourcedAccount>): Promise<SourcedAccount[]> {
  const out: SourcedAccount[] = [];
  for await (const a of it) out.push(a);
  return out;
}

describe("icpQueryToApolloParams (AC1, via the spec-01 adapter)", () => {
  it("maps a canonical segment to Apollo org-search params", () => {
    const q: CanonicalICPQuery = { keywords: ["saas"], employees: { min: 50, max: 200 }, locations: ["FR"], technologies: ["nextjs"] };
    const p = icpQueryToApolloParams(q);
    expect(p.q_organization_keyword_tags).toEqual(["saas"]);
    expect(p.organization_num_employees_ranges).toEqual(["50,200"]);
    expect(p.organization_locations).toEqual(["FR"]);
    expect(p.currently_using_any_of_technology_uids).toEqual(["nextjs"]);
  });
});

describe("countAccounts (AC2, credit-free)", () => {
  it("returns total via a single per_page=1 call and meters it", async () => {
    const s = stub([], 4200);
    const { deps: d, meterOps } = deps({ searchOrgs: s.searchOrgs });
    const r = await countAccounts({ keywords: ["saas"] }, d);
    expect(r).toEqual({ total: 4200, capped: false });
    expect(s.calls.length).toBe(1);
    expect(s.calls[0].per_page).toBe(1); // no page fetched
    expect(meterOps).toHaveLength(1);
    expect(meterOps[0].kind).toBe("sourcing.count");
  });
  it("flags capped at the 50k ceiling", async () => {
    const s = stub([], APOLLO_MAX_RESULTS);
    const { deps: d } = deps({ searchOrgs: s.searchOrgs });
    expect((await countAccounts({}, d)).capped).toBe(true);
  });
});

describe("sourceAccounts (AC2/AC3/AC4/AC5)", () => {
  it("paginates and stops on the last short page; meters each page", async () => {
    const s = stub([Array.from({ length: 100 }, (_, i) => org(i)), Array.from({ length: 30 }, (_, i) => org(100 + i))], 130);
    const { deps: d, meterOps } = deps({ searchOrgs: s.searchOrgs });
    const out = await collect(sourceAccounts({ keywords: ["saas"] }, d, { volume: 1000 }));
    expect(out.length).toBe(130);
    expect(s.calls.every((c) => c.per_page === 100)).toBe(true);
    expect(meterOps.length).toBe(2); // one per page
  });

  it("respects the requested volume target", async () => {
    const s = stub([Array.from({ length: 100 }, (_, i) => org(i)), Array.from({ length: 100 }, (_, i) => org(100 + i))], 5000);
    const { deps: d } = deps({ searchOrgs: s.searchOrgs });
    const out = await collect(sourceAccounts({ keywords: ["saas"] }, d, { volume: 150 }));
    expect(out.length).toBe(150);
  });

  it("normalizes to the canonical shape — no Apollo vendor field escapes (AC3)", async () => {
    const s = stub([[org(1)]], 1);
    const { deps: d } = deps({ searchOrgs: s.searchOrgs });
    const [a] = await collect(sourceAccounts({}, d, { volume: 10 }));
    expect(a).not.toHaveProperty("estimated_num_employees");
    expect(a).not.toHaveProperty("primary_domain");
    expect(a.domain).toBe("co1.fr");
    expect(a.employeeCount).toBe(120);
    expect(a.country).toBe("FR"); // normalized from "France"
  });

  it("persists each account via the injected spec-00 upsert (AC3)", async () => {
    const s = stub([[org(1), org(2)]], 2);
    const upsertAccount = vi.fn(async () => {});
    const { deps: d } = deps({ searchOrgs: s.searchOrgs, upsertAccount });
    await collect(sourceAccounts({}, d, { volume: 10 }));
    expect(upsertAccount).toHaveBeenCalledTimes(2);
    expect(upsertAccount).toHaveBeenCalledWith("t1", expect.objectContaining({ domain: "co1.fr" }));
  });
});

describe("caps", () => {
  it("never targets beyond the 50k ceiling", () => {
    expect(APOLLO_MAX_RESULTS).toBe(50_000);
  });
});
