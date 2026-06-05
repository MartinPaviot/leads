import { describe, it, expect, vi, beforeEach } from "vitest";

const { getModelForTaskMock, tracedGenerateObjectMock } = vi.hoisted(() => ({
  getModelForTaskMock: vi.fn(),
  tracedGenerateObjectMock: vi.fn(),
}));

vi.mock("@/lib/ai/ai-provider", () => ({
  getModelForTask: (...a: unknown[]) => getModelForTaskMock(...a),
}));
vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: (...a: unknown[]) => tracedGenerateObjectMock(...a),
}));

const { detectComponents, DetectionUnavailable } = await import("../detect-components");

const TEXT = "Executive Summary\nWe propose...\nPricing\n$X";
const OUTLINE = [
  { level: 1, text: "Executive Summary", offset: 0 },
  { level: 2, text: "Pricing", offset: TEXT.indexOf("Pricing") },
];

const LLM_OK = {
  object: {
    components: [
      {
        kind: "section",
        label: "Executive Summary",
        placeholderToken: "exec summary",
        dataKey: null,
        anchorIndex: 0,
        // Drifted free text on purpose — index 0 must win and store the exact text.
        anchorHeading: "executive summary",
        required: true,
        confidence: "high",
      },
      {
        kind: "field",
        label: "Client name",
        placeholderToken: "{{client}}",
        dataKey: "company.name",
        anchorIndex: null,
        anchorHeading: null,
        required: true,
        confidence: "high",
      },
      {
        kind: "field",
        label: "Mystery value",
        placeholderToken: "x",
        dataKey: "not.a.key",
        anchorIndex: null,
        anchorHeading: null,
        required: false,
        confidence: "low",
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getModelForTaskMock.mockReturnValue({ modelId: "claude-sonnet-4-6" });
});

describe("detectComponents", () => {
  it("normalizes the LLM output into a stored component map", async () => {
    tracedGenerateObjectMock.mockResolvedValue(LLM_OK);

    const { componentMap, meta } = await detectComponents(TEXT, OUTLINE, {
      tenantId: "t1",
    });

    expect(componentMap.version).toBe(1);
    expect(componentMap.components).toHaveLength(3);

    const [sec, field, mystery] = componentMap.components;

    // ids + order assigned by us
    expect(typeof sec.id).toBe("string");
    expect(componentMap.components.map((c) => c.order)).toEqual([0, 1, 2]);

    // token normalized; section anchor resolved from the outline
    expect(sec.placeholderToken).toBe("{{exec_summary}}");
    expect(sec.dataKey).toBeNull();
    expect(sec.anchor).toEqual({ headingText: "Executive Summary", offset: 0 });

    // known dataKey kept; unknown coerced to null for the confirm step to fix
    expect(field.dataKey).toBe("company.name");
    expect(mystery.dataKey).toBeNull();

    expect(meta).toEqual({ truncated: false, model: "claude-sonnet-4-6", componentCount: 3 });
  });

  it("passes the correct trace metadata", async () => {
    tracedGenerateObjectMock.mockResolvedValue(LLM_OK);
    await detectComponents(TEXT, OUTLINE, { tenantId: "t1" });
    expect(tracedGenerateObjectMock).toHaveBeenCalledTimes(1);
    expect(tracedGenerateObjectMock.mock.calls[0][0]._trace).toEqual({
      agentId: "skill-proposal-detect-components",
      tenantId: "t1",
    });
  });

  it("retries once on an invalid response, then succeeds", async () => {
    tracedGenerateObjectMock
      .mockRejectedValueOnce(new Error("schema validation failed"))
      .mockResolvedValueOnce(LLM_OK);

    const { componentMap } = await detectComponents(TEXT, OUTLINE, { tenantId: "t1" });
    expect(tracedGenerateObjectMock).toHaveBeenCalledTimes(2);
    expect(componentMap.components).toHaveLength(3);
  });

  it("throws DetectionUnavailable when no model is configured", async () => {
    getModelForTaskMock.mockReturnValue(null);
    await expect(detectComponents(TEXT, OUTLINE, { tenantId: "t1" })).rejects.toMatchObject({
      name: "DetectionUnavailable",
      reason: "missing_required_data",
    });
    expect(tracedGenerateObjectMock).not.toHaveBeenCalled();
  });

  it("throws DetectionUnavailable after two failed attempts", async () => {
    tracedGenerateObjectMock.mockRejectedValue(new Error("model down"));
    await expect(
      detectComponents(TEXT, OUTLINE, { tenantId: "t1" }),
    ).rejects.toBeInstanceOf(DetectionUnavailable);
    expect(tracedGenerateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to run on empty text (never fabricates a map)", async () => {
    await expect(detectComponents("   ", [], { tenantId: "t1" })).rejects.toMatchObject({
      reason: "missing_required_data",
    });
    expect(getModelForTaskMock).not.toHaveBeenCalled();
  });
});
