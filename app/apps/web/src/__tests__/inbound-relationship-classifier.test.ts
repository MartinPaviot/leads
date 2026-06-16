import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI infra so the real @ai-sdk providers are never imported (keeps the
// suite off the local @ai-sdk/provider flake) and the LLM output is injectable.
const { generateObjectMock, getModelMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  getModelMock: vi.fn(() => ({ id: "mock-model" }) as unknown),
}));

vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: (args: unknown) => generateObjectMock(args),
}));
vi.mock("@/lib/ai/ai-provider", () => ({
  getModelForTask: () => getModelMock(),
}));
vi.mock("@/lib/enrichment/email-extract", () => ({
  truncateForLLM: (s: string) => s,
}));

import { classifyInboundRelationship } from "@/lib/inbound/relationship-classifier";

beforeEach(() => {
  generateObjectMock.mockReset();
  getModelMock.mockReset();
  getModelMock.mockReturnValue({ id: "mock-model" });
});

describe("classifyInboundRelationship", () => {
  it("returns the verdict for a prospect (could buy from us)", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        relationshipToUs: "prospect",
        isInboundLead: true,
        intent: "buying",
        confidence: 0.9,
        reason: "Asking for a demo of our product.",
      },
    });
    const v = await classifyInboundRelationship({
      fromHeader: "Anna Keller <anna@romandco.ch>",
      text: "We'd like a demo",
      productDescription: "X",
      icpSummary: "Y",
    });
    expect(v?.isInboundLead).toBe(true);
    expect(v?.relationshipToUs).toBe("prospect");
  });

  it("flags a vendor we pay as NOT a lead", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        relationshipToUs: "vendor",
        isInboundLead: false,
        intent: "notification",
        confidence: 0.85,
        reason: "A service the workspace subscribes to.",
      },
    });
    const v = await classifyInboundRelationship({
      fromHeader: "Acme <team@acme-saas.com>",
      text: "Your invoice is ready",
    });
    expect(v?.isInboundLead).toBe(false);
    expect(v?.relationshipToUs).toBe("vendor");
  });

  it("puts the tenant's product + ICP into the prompt (LLM over real labels, not a hardcoded list)", async () => {
    generateObjectMock.mockResolvedValue({
      object: { relationshipToUs: "unknown", isInboundLead: false, intent: "other", confidence: 0.3, reason: "x" },
    });
    await classifyInboundRelationship({
      fromHeader: "a@b.com",
      productDescription: "Sovereign Microsoft 365 alternative",
      icpSummary: "Suisse romande, 100-1000 FTE, low-tech sectors",
    });
    const arg = generateObjectMock.mock.calls[0][0] as { prompt: string };
    expect(arg.prompt).toContain("Sovereign Microsoft 365 alternative");
    expect(arg.prompt).toContain("Suisse romande, 100-1000 FTE, low-tech sectors");
    expect(arg.prompt).toMatch(/DIRECTION of the relationship/);
  });

  it("fails open to null when no model is configured", async () => {
    getModelMock.mockReturnValue(null);
    const v = await classifyInboundRelationship({ fromHeader: "a@b.com" });
    expect(v).toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("fails open to null when the model call throws", async () => {
    generateObjectMock.mockRejectedValue(new Error("boom"));
    const v = await classifyInboundRelationship({ fromHeader: "a@b.com", text: "hi" });
    expect(v).toBeNull();
  });
});
