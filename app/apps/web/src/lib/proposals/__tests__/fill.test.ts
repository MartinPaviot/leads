import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  dbMock,
  getModelForTaskMock,
  tracedGenerateObjectMock,
  getTenantSettingsMock,
  getSkillKnowledgeMock,
  collectSourcesMock,
} = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  getModelForTaskMock: vi.fn(),
  tracedGenerateObjectMock: vi.fn(),
  getTenantSettingsMock: vi.fn(),
  getSkillKnowledgeMock: vi.fn(),
  collectSourcesMock: vi.fn(),
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
  isNull: (x: unknown) => ({ isNull: x }),
}));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (...a: unknown[]) => getTenantSettingsMock(...a),
}));
vi.mock("@/skills/skill-knowledge", () => ({
  getSkillKnowledge: (...a: unknown[]) => getSkillKnowledgeMock(...a),
}));
vi.mock("../sources", () => ({
  collectCitableSources: (...a: unknown[]) => collectSourcesMock(...a),
}));
vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: (...a: unknown[]) => tracedGenerateObjectMock(...a),
}));
vi.mock("@/lib/ai/ai-provider", () => ({
  getModelForTask: (...a: unknown[]) => getModelForTaskMock(...a),
}));
// @/lib/deals/amount intentionally NOT mocked — exercise the real helper.

const { resolveFieldValue, generateSections, buildProposalFill, regenerateComponent, FillUnavailable, toBcp47 } =
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
  locale: "en-US",
};

describe("resolveFieldValue", () => {
  it("resolves keys and uses the sanctioned deal total", () => {
    expect(resolveFieldValue("company.name", BASE_FIELD_CTX)).toBe("Acme");
    expect(resolveFieldValue("contact.name", BASE_FIELD_CTX)).toBe("Sarah Chen");
    expect(resolveFieldValue("deal.amount", BASE_FIELD_CTX)).toBe("$50,000");
    expect(resolveFieldValue("deal.amount", { ...BASE_FIELD_CTX, deal: { ...BASE_FIELD_CTX.deal, value: null, projectAmount: 30000, platformArr: 20000 } })).toBe("$50,000");
    expect(resolveFieldValue("not.a.key", BASE_FIELD_CTX)).toBe("");
    expect(resolveFieldValue("company.name", { ...BASE_FIELD_CTX, company: null })).toBe("");
  });

  it("formats date.today per locale and never throws (PROPOSAL-011)", () => {
    expect(resolveFieldValue("date.today", { ...BASE_FIELD_CTX, locale: "en-US" })).toContain("2026");
    expect(resolveFieldValue("date.today", { ...BASE_FIELD_CTX, locale: "fr-FR" })).toContain("2026");
    expect(() => resolveFieldValue("date.today", { ...BASE_FIELD_CTX, locale: "@@bad@@" })).not.toThrow();
  });

  it("toBcp47 normalizes pilae REGION-language tags", () => {
    expect(toBcp47("FR-fr")).toBe("fr-FR");
    expect(toBcp47("US-en")).toBe("en-US");
    expect(toBcp47("fr-FR")).toBe("fr-FR");
  });
});

describe("generateSections (trust)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns {} for no sections without a model call", async () => {
    expect(await generateSections([], "ctx", "t1")).toEqual({});
    expect(getModelForTaskMock).not.toHaveBeenCalled();
  });

  it("maps content + confidence + citations + abstain per id", async () => {
    getModelForTaskMock.mockReturnValue({ modelId: "m" });
    tracedGenerateObjectMock.mockResolvedValue({
      object: { sections: [{ id: "s1", content: "Exec", confidence: "high", citationIds: ["A1"], abstained: false }] },
    });
    const out = await generateSections([{ id: "s1", label: "Exec" }], "ctx", "t1");
    expect(out).toEqual({ s1: { content: "Exec", confidence: "high", citationIds: ["A1"], abstained: false } });
  });

  it("abstains (FillUnavailable) with no model", async () => {
    getModelForTaskMock.mockReturnValue(null);
    await expect(generateSections([{ id: "s1", label: "Exec" }], "ctx", "t1")).rejects.toMatchObject({
      name: "FillUnavailable",
      reason: "missing_required_data",
    });
  });
});

describe("buildProposalFill (trust)", () => {
  const MAP = {
    version: 1,
    components: [
      { id: "f1", kind: "field", label: "Client", placeholderToken: "{{client}}", dataKey: "company.name", anchor: { headingText: null, offset: null }, required: true, confidence: "high", order: 0 },
      { id: "sec1", kind: "section", label: "Executive Summary", placeholderToken: "{{exec}}", dataKey: null, anchor: { headingText: "Executive Summary", offset: 0 }, required: true, confidence: "high", order: 1 },
    ],
  };
  const TEMPLATE = { id: "tpl1", tenantId: "t1", status: "mapped", componentMap: MAP };
  const DEAL = { id: "d1", tenantId: "t1", name: "Acme Deal", stage: "proposal", companyId: "co1", contactId: "c1", value: 50000, projectAmount: null, platformArr: null, summary: "Q2" };
  const COMPANY = { id: "co1", name: "Acme", industry: "SaaS", description: "PM" };
  const CONTACT = { id: "c1", firstName: "Sarah", lastName: "Chen", title: "VP", email: "s@acme.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    getTenantSettingsMock.mockResolvedValue({ onboardingCompanyName: "Elevay", productDescription: "GTM" });
    getSkillKnowledgeMock.mockResolvedValue("");
    getModelForTaskMock.mockReturnValue({ modelId: "m" });
    collectSourcesMock.mockResolvedValue({
      sources: [{ id: "A1", type: "activity", label: "email_sent outbound", snippet: "pricing deck", date: "2026-05-28" }],
      block: "[A1] (2026-05-28, email_sent outbound) pricing deck",
      byId: new Map([["A1", { id: "A1", type: "activity", label: "email_sent outbound", snippet: "pricing deck", date: "2026-05-28" }]]),
    });
    // sec1 returns LOW confidence to verify triage ordering puts it first.
    tracedGenerateObjectMock.mockResolvedValue({
      object: { sections: [{ id: "sec1", content: "Generated summary", confidence: "low", citationIds: ["A1", "GHOST"], abstained: false }] },
    });
  });

  it("attaches confidence + resolved citations and persists them; triages low-confidence first", async () => {
    let idx = 0;
    dbMock.select.mockImplementation(() => {
      idx++;
      return chainOf([[TEMPLATE], [DEAL], [COMPANY], [CONTACT]][idx - 1] ?? []);
    });

    const res = await buildProposalFill("tpl1", "d1", { tenantId: "t1", userId: "u1", now: FIXED_NOW });

    // low-confidence section sorts before the high-confidence field
    expect(res.components.map((c) => c.confidence)).toEqual(["low", "high"]);
    const sec = res.components.find((c) => c.componentId === "sec1")!;
    const field = res.components.find((c) => c.componentId === "f1")!;

    expect(field.content).toBe("Acme");
    expect(field.confidence).toBe("high");
    expect(field.citations[0]).toMatchObject({ type: "field", label: "company.name" });

    expect(sec.content).toBe("Generated summary");
    // only the valid citation id resolves; GHOST is dropped
    expect(sec.citations).toHaveLength(1);
    expect(sec.citations[0]).toMatchObject({ id: "A1", type: "activity", date: "2026-05-28" });

    // PROPOSAL-009: independent grading — the cited source ("pricing deck") does
    // not support the prose ("Generated summary") -> flagged unsupported.
    expect(sec.unsupported).toBe(true);
    expect(sec.supportRatio).toBe(0);
    expect(field.unsupported).toBe(false);
    expect(field.supportRatio).toBe(1);

    // proposals + proposal_components share one mocked values() fn; the 2nd
    // call is the components array. Assert persisted confidence + source.
    const valuesFn = dbMock.insert.mock.results[0].value.values as ReturnType<typeof vi.fn>;
    const compValues = valuesFn.mock.calls[1][0] as Array<Record<string, unknown>>;
    expect(compValues[0]).toHaveProperty("confidence");
    expect(compValues[0].source as Record<string, unknown>).toHaveProperty("citations");
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
  });

  it("throws template_not_mapped / deal_not_found", async () => {
    dbMock.select.mockReturnValue(chainOf([{ ...TEMPLATE, status: "uploaded", componentMap: null }]));
    await expect(buildProposalFill("tpl1", "d1", { tenantId: "t1" })).rejects.toMatchObject({ reason: "template_not_mapped" });

    let idx = 0;
    dbMock.select.mockImplementation(() => {
      idx++;
      return chainOf(idx === 1 ? [TEMPLATE] : []);
    });
    await expect(buildProposalFill("tpl1", "missing", { tenantId: "t1" })).rejects.toMatchObject({ reason: "deal_not_found" });
  });
});

describe("regenerateComponent", () => {
  const MAP = {
    version: 1,
    components: [
      { id: "f1", kind: "field", label: "Client", placeholderToken: "{{c}}", dataKey: "company.name", anchor: { headingText: null, offset: null }, required: true, confidence: "high", order: 0 },
      { id: "sec1", kind: "section", label: "Executive Summary", placeholderToken: "{{e}}", dataKey: null, anchor: { headingText: "Executive Summary", offset: 0 }, required: true, confidence: "high", order: 1 },
    ],
  };
  const TEMPLATE = { id: "tpl1", tenantId: "t1", status: "mapped", componentMap: MAP };
  const DEAL = { id: "d1", tenantId: "t1", name: "Acme Deal", stage: "proposal", companyId: "co1", contactId: "c1", value: 50000, projectAmount: null, platformArr: null, summary: "Q2" };
  const COMPANY = { id: "co1", name: "Acme", industry: "SaaS", description: "PM" };
  const CONTACT = { id: "c1", firstName: "Sarah", lastName: "Chen", title: "VP", email: "s@acme.com" };
  const SRC = { id: "A1", type: "activity", label: "email", snippet: "faster proposal turnaround", date: "2026-05-28" };

  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSettingsMock.mockResolvedValue({ onboardingCompanyName: "Elevay", productDescription: "GTM" });
    getModelForTaskMock.mockReturnValue({ modelId: "m" });
    collectSourcesMock.mockResolvedValue({ sources: [SRC], block: "[A1] ...", byId: new Map([["A1", SRC]]) });
    dbMock.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  });

  function selectSeq() {
    let idx = 0;
    dbMock.select.mockImplementation(() => {
      idx++;
      return chainOf([[{ id: "p1", templateId: "tpl1", dealId: "d1" }], [TEMPLATE], [DEAL], [COMPANY], [CONTACT]][idx - 1] ?? []);
    });
  }

  it("re-drafts a section, grades it, and persists", async () => {
    selectSeq();
    tracedGenerateObjectMock.mockResolvedValue({
      object: { sections: [{ id: "sec1", content: "Faster proposal turnaround for Acme.", confidence: "high", citationIds: ["A1"], abstained: false }] },
    });
    const res = await regenerateComponent("p1", "sec1", { tenantId: "t1", guidance: "emphasize ROI" });
    expect(res.componentId).toBe("sec1");
    expect(res.content).toContain("Faster proposal turnaround");
    expect(res.unsupported).toBe(false);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("re-resolves a field deterministically", async () => {
    selectSeq();
    const res = await regenerateComponent("p1", "f1", { tenantId: "t1" });
    expect(res.content).toBe("Acme");
    expect(res.confidence).toBe("high");
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("throws when the proposal is not found", async () => {
    dbMock.select.mockReturnValue(chainOf([]));
    await expect(regenerateComponent("missing", "sec1", { tenantId: "t1" })).rejects.toMatchObject({ name: "FillUnavailable" });
  });
});
