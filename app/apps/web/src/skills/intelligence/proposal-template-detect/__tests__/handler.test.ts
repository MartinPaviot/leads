import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, detectComponentsMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn() },
  detectComponentsMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/db/schema", () => ({
  proposalTemplates: { id: "id", tenantId: "tenant_id" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
}));
vi.mock("@/lib/proposals/detect-components", () => ({
  detectComponents: (...a: unknown[]) => detectComponentsMock(...a),
}));

const { proposalTemplateDetectHandler } = await import("../handler");

function chainOf(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) self[m] = () => self;
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  return self;
}

const COMPONENT_MAP = {
  version: 1 as const,
  components: [
    {
      id: "x",
      kind: "section" as const,
      label: "Executive Summary",
      placeholderToken: "{{executive_summary}}",
      dataKey: null,
      anchor: { headingText: "Executive Summary", offset: 0 },
      required: true,
      confidence: "high" as const,
      order: 0,
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("proposalTemplateDetectHandler", () => {
  it("detects components for a tenant-owned template", async () => {
    dbMock.select.mockReturnValue(
      chainOf([
        {
          id: "tpl1",
          tenantId: "t1",
          extractedText: "Executive Summary\n...",
          extractedOutline: [{ level: 1, text: "Executive Summary", offset: 0 }],
        },
      ]),
    );
    detectComponentsMock.mockResolvedValue({
      componentMap: COMPONENT_MAP,
      meta: { truncated: false, model: "claude-sonnet-4-6", componentCount: 1 },
    });

    const out = await proposalTemplateDetectHandler(
      { templateId: "tpl1" },
      { tenantId: "t1", dryRun: false },
    );

    expect(out.templateId).toBe("tpl1");
    expect(out.componentMap).toEqual(COMPONENT_MAP);
    expect(out.detectionMeta.componentCount).toBe(1);
    // detection is called with the template's text + outline + tenant
    expect(detectComponentsMock).toHaveBeenCalledWith(
      "Executive Summary\n...",
      [{ level: 1, text: "Executive Summary", offset: 0 }],
      { tenantId: "t1" },
    );
  });

  it("throws when the template is not in the tenant", async () => {
    dbMock.select.mockReturnValue(chainOf([]));
    await expect(
      proposalTemplateDetectHandler(
        { templateId: "missing" },
        { tenantId: "t1", dryRun: false },
      ),
    ).rejects.toThrow("not found");
  });

  it("propagates detection failure (no fabricated map)", async () => {
    dbMock.select.mockReturnValue(
      chainOf([{ id: "tpl1", tenantId: "t1", extractedText: "x", extractedOutline: [] }]),
    );
    detectComponentsMock.mockRejectedValue(new Error("DetectionUnavailable: no model"));
    await expect(
      proposalTemplateDetectHandler(
        { templateId: "tpl1" },
        { tenantId: "t1", dryRun: false },
      ),
    ).rejects.toThrow("DetectionUnavailable");
  });
});
