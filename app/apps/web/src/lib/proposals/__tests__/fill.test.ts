import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  dbMock,
  getModelForTaskMock,
  tracedGenerateObjectMock,
  getTenantSettingsMock,
  getSkillKnowledgeMock,
  getDeepConversationContextMock,
  getCompanyContactsMock,
} = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn() },
  getModelForTaskMock: vi.fn(),
  tracedGenerateObjectMock: vi.fn(),
  getTenantSettingsMock: vi.fn(),
  getSkillKnowledgeMock: vi.fn(),
  getDeepConversationContextMock: vi.fn(),
  getCompanyContactsMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/db/schema", () => ({
  proposals: { id: "id", tenantId: "tenant_id" },
  proposalComponents: { id: "id", tenantId: "tenant_id" },
  proposalTemplates: { id: "id", tenantId: "tenant_id" },
  deals: { id: "id", tenantId: "tenant_id" },
  companies: { id: "id" },
  contacts: { id: "id", tenantId: "tenant_id" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
}));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (...a: unknown[]) => getTenantSettingsMock(...a),
}));
vi.mock("@/skills/skill-knowledge", () => ({
  getSkillKnowledge: (...a: unknown[]) => getSkillKnowledgeMock(...a),
  getDeepConversationContext: (...a: unknown[]) => getDeepConversationContextMock(...a),
  getCompanyContacts: (...a: unknown[]) => getCompanyContactsMock(...a),
}));
vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: (...a: unknown[]) => tracedGenerateObjectMock(...a),
}));
vi.mock("@/lib/ai/ai-provider", () => ({
  getModelForTask: (...a: unknown[]) => getModelForTaskMock(...a),
}));
// NOTE: @/lib/deals/amount is intentionally NOT mocked — exercise the real helper.

const { resolveFieldValue, generateSections, buildProposalFill, FillUnavailable } =
  await import("../fill");

function chainOf(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) self[m] = () => self;
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  return self;
}

const FIXED_NOW = new Date("2026-06-04T12:00:00Z");

const BASE_FIELD_CTX = {
  company: { name: "Acme", industry: "SaaS", description: "PM platform" },
  contact: { firstName: "Sarah", lastName: "Chen", title: "VP Eng", email: "s@acme.com" },
  deal: { name: "Acme Deal", summary: "Q2 rollout", value: 50000, projectAmount: null, platformArr: null },
  settings: { onboardingCompanyName: "Elevay", productDescription: "Autonomous GTM" },
  now: FIXED_NOW,
};

describe("resolveFieldValue", () => {
  it("resolves each dataKey from structured data", () => {
    const r = (k: string) => resolveFieldValue(k, BASE_FIELD_CTX);
    expect(r("company.name")).toBe("Acme");
    expect(r("company.industry")).toBe("SaaS");
    expect(r("contact.name")).toBe("Sarah Chen");
    expect(r("contact.title")).toBe("VP Eng");
    expect(r("deal.name")).toBe("Acme Deal");
    expect(r("deal.summary")).toBe("Q2 rollout");
    expect(r("seller.companyName")).toBe("Elevay");
    expect(r("date.today")).toContain("2026");
  });

  it("uses the sanctioned deal total for deal.amount (legacy value path)", () => {
    expect(resolveFieldValue("deal.amount", BASE_FIELD_CTX)).toBe("$50,000");
  });

  it("uses project+platform total for split deals", () => {
    const ctx = { ...BASE_FIELD_CTX, deal: { ...BASE_FIELD_CTX.deal, value: null, projectAmount: 30000, platformArr: 20000 } };
    expect(resolveFieldValue("deal.amount", ctx)).toBe("$50,000");
  });

  it("returns empty string for missing data and unknown keys (never 'undefined')", () => {
    const ctx = { ...BASE_FIELD_CTX, company: null };
    expect(resolveFieldValue("company.name", ctx)).toBe("");
    expect(resolveFieldValue("not.a.key", BASE_FIELD_CTX)).toBe("");
  });
});

describe("generateSections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns {} for no sections without calling the model", async () => {
    const out = await generateSections([], "ctx", "t1");
    expect(out).toEqual({});
    expect(getModelForTaskMock).not.toHaveBeenCalled();
  });

  it("maps LLM output by section id", async () => {
    getModelForTaskMock.mockReturnValue({ modelId: "m" });
    tracedGenerateObjectMock.mockResolvedValue({
      object: { sections: [{ id: "s1", content: "Exec prose" }] },
    });
    const out = await generateSections([{ id: "s1", label: "Exec" }], "ctx", "t1");
    expect(out).toEqual({ s1: "Exec prose" });
    expect(tracedGenerateObjectMock.mock.calls[0][0]._trace).toEqual({
      agentId: "skill-proposal-fill-sections",
      tenantId: "t1",
    });
  });

  it("abstains (FillUnavailable) when no model and sections exist", async () => {
    getModelForTaskMock.mockReturnValue(null);
    await expect(generateSections([{ id: "s1", label: "Exec" }], "ctx", "t1")).rejects.toMatchObject({
      name: "FillUnavailable",
      reason: "missing_required_data",
    });
  });
});

describe("buildProposalFill", () => {
  const MAP = {
    version: 1,
    components: [
      {
        id: "f1",
        kind: "field",
        label: "Client",
        placeholderToken: "{{client}}",
        dataKey: "company.name",
        anchor: { headingText: null, offset: null },
        required: true,
        confidence: "high",
        order: 0,
      },
      {
        id: "sec1",
        kind: "section",
        label: "Executive Summary",
        placeholderToken: "{{exec}}",
        dataKey: null,
        anchor: { headingText: "Executive Summary", offset: 0 },
        required: true,
        confidence: "high",
        order: 1,
      },
    ],
  };
  const TEMPLATE = { id: "tpl1", tenantId: "t1", status: "mapped", componentMap: MAP };
  const DEAL = {
    id: "d1",
    tenantId: "t1",
    name: "Acme Deal",
    stage: "proposal",
    companyId: "co1",
    contactId: "c1",
    value: 50000,
    projectAmount: null,
    platformArr: null,
    summary: "Q2",
  };
  const COMPANY = { id: "co1", name: "Acme", industry: "SaaS", description: "PM" };
  const CONTACT = { id: "c1", firstName: "Sarah", lastName: "Chen", title: "VP", email: "s@acme.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    getTenantSettingsMock.mockResolvedValue({ onboardingCompanyName: "Elevay", productDescription: "GTM" });
    getSkillKnowledgeMock.mockResolvedValue("");
    getDeepConversationContextMock.mockResolvedValue({ activities: "", notes: "", semanticResults: "" });
    getCompanyContactsMock.mockResolvedValue([]);
    getModelForTaskMock.mockReturnValue({ modelId: "m" });
    tracedGenerateObjectMock.mockResolvedValue({ object: { sections: [{ id: "sec1", content: "Generated summary" }] } });
  });

  it("fills field + section and persists the proposal", async () => {
    let idx = 0;
    dbMock.select.mockImplementation(() => {
      idx++;
      return chainOf([[TEMPLATE], [DEAL], [COMPANY], [CONTACT]][idx - 1] ?? []);
    });

    const res = await buildProposalFill("tpl1", "d1", { tenantId: "t1", userId: "u1", now: FIXED_NOW });

    expect(res.components.map((c) => c.content)).toEqual(["Acme", "Generated summary"]);
    expect(res.unmappedSections).toEqual([]);
    expect(typeof res.proposalId).toBe("string");
    // proposals + proposal_components inserts
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
  });

  it("throws template_not_mapped when the template is not mapped", async () => {
    dbMock.select.mockReturnValue(chainOf([{ ...TEMPLATE, status: "uploaded", componentMap: null }]));
    await expect(
      buildProposalFill("tpl1", "d1", { tenantId: "t1" }),
    ).rejects.toMatchObject({ name: "FillUnavailable", reason: "template_not_mapped" });
  });

  it("throws deal_not_found when the deal is absent", async () => {
    let idx = 0;
    dbMock.select.mockImplementation(() => {
      idx++;
      return chainOf(idx === 1 ? [TEMPLATE] : []);
    });
    await expect(
      buildProposalFill("tpl1", "missing", { tenantId: "t1" }),
    ).rejects.toMatchObject({ reason: "deal_not_found" });
  });
});
