import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSettingsMock, selectChainMock, clearCacheFn } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  selectChainMock: vi.fn(),
  clearCacheFn: { fn: null as (() => void) | null },
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: (tenantId: string) => getSettingsMock(tenantId),
  buildIgnoredDomains: () => new Set(["gmail.com", "outlook.com"]),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => selectChainMock(),
  },
}));

vi.mock("@/db/schema", () => ({
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
    direction: "direction",
    summary: "summary",
    occurredAt: "occurred_at",
  },
  contacts: {
    id: "id",
    tenantId: "tenant_id",
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    title: "title",
    companyId: "company_id",
  },
  companies: {
    id: "id",
    name: "name",
    domain: "domain",
    industry: "industry",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  gte: (...args: unknown[]) => ({ gte: args }),
  isNotNull: (x: unknown) => ({ isNotNull: x }),
  sql: (strings: TemplateStringsArray, ...exprs: unknown[]) => ({ sql: { strings, exprs } }),
}));

const { rankWarmLeads, clearWarmLeadCacheForTest } = await import(
  "@/lib/warm-leads"
);
clearCacheFn.fn = clearWarmLeadCacheForTest;

function setRows(rows: unknown[]) {
  selectChainMock.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        leftJoin: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(rows),
          }),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  getSettingsMock.mockReset();
  selectChainMock.mockReset();
  clearCacheFn.fn?.();
});

describe("rankWarmLeads", () => {
  it("returns empty array for a tenant with no activities", async () => {
    getSettingsMock.mockResolvedValue({});
    setRows([]);
    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("ranks by composite score and returns top N", async () => {
    getSettingsMock.mockResolvedValue({
      targetSeniorities: ["VP"],
      targetIndustries: ["Computer Software"],
      companyDomain: "acme.com",
    });
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    setRows([
      {
        contactId: "c-recent-high",
        firstName: "Alice",
        lastName: "Chen",
        email: "alice@acme-target.com",
        title: "VP Engineering",
        companyId: "cmp1",
        companyName: "Acme Target",
        companyDomain: "acme-target.com",
        industry: "Computer Software",
        activityCount: 8,
        lastActivityAt: new Date(now - 3 * day),
        inboundCount: 4,
        lastSummary: "Thanks for the follow-up, let's circle back next month",
      },
      {
        contactId: "c-old-icp-fit",
        firstName: "Bob",
        lastName: "Old",
        email: "bob@cold-industry.com",
        title: "Intern",
        companyId: "cmp2",
        companyName: "Cold Co",
        companyDomain: "cold-industry.com",
        industry: "Unrelated",
        activityCount: 2,
        lastActivityAt: new Date(now - 60 * day),
        inboundCount: 1,
        lastSummary: "Thanks for reaching out",
      },
    ]);

    const leads = await rankWarmLeads("t1", { limit: 2 });
    expect(leads).toHaveLength(2);
    expect(leads[0].contactId).toBe("c-recent-high");
    expect(leads[0].rankScore).toBeGreaterThan(leads[1].rankScore);
  });

  it("filters out contacts in ignored domains", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "gmail-user",
        firstName: "Cold",
        lastName: "Gmail",
        email: "someone@gmail.com",
        title: null,
        companyId: null,
        companyName: null,
        companyDomain: null,
        industry: null,
        activityCount: 5,
        lastActivityAt: new Date(now - 5 * 86_400_000),
        inboundCount: 3,
        lastSummary: "hi",
      },
    ]);

    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("filters out contacts with zero inbound activity (cold, not warm)", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "cold-outbound",
        firstName: null,
        lastName: null,
        email: "prospect@example.com",
        title: null,
        companyId: null,
        companyName: null,
        companyDomain: null,
        industry: null,
        activityCount: 5,
        lastActivityAt: new Date(now - 2 * 86_400_000),
        inboundCount: 0,
        lastSummary: null,
      },
    ]);

    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("caches results for 5 minutes within the same tenant", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "c1",
        firstName: "A",
        lastName: "B",
        email: "a@example-corp.com",
        title: null,
        companyId: null,
        companyName: null,
        companyDomain: null,
        industry: null,
        activityCount: 3,
        lastActivityAt: new Date(now - 2 * 86_400_000),
        inboundCount: 2,
        lastSummary: null,
      },
    ]);

    const first = await rankWarmLeads("t1");
    expect(first).toHaveLength(1);
    // Change the mocked rows — the cache should still win.
    setRows([]);
    const second = await rankWarmLeads("t1");
    expect(second).toHaveLength(1);
    expect(second[0].contactId).toBe("c1");
  });
});
