import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateText: vi.fn() }));
vi.mock("@/lib/ai/ai-provider", () => ({
  anthropic: () => ({ id: "sonnet" }),
  getModelForTask: (t: string) => (t === "lightweight" ? { id: "haiku" } : null),
}));

import { runResearchAgent, routeStep } from "../research-agent";
import { tracedGenerateText } from "@/lib/ai/traced-ai";

beforeEach(() => vi.clearAllMocks());

describe("runResearchAgent — output mapping", () => {
  it("maps experimental_output to SynthesizedFields and derives publicContentDepth", async () => {
    vi.mocked(tracedGenerateText).mockResolvedValue({
      experimental_output: {
        websiteSummary: "Summary",
        painPoints: ["ramp"],
        bestAngle: "lost VP Sales",
        competitorDetected: "Outreach",
        communicationStyle: null,
        publicContent: [{ type: "blog_post", title: "t", quote: "q", url: "", date: "" }],
        warmthSignals: [],
      },
      steps: [{}, {}],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const r = await runResearchAgent({ tenantId: "t1", companyName: "Acme", domain: "acme.com", contact: null });
    expect(r.synthesized.bestAngle).toBe("lost VP Sales");
    expect(r.synthesized.competitorDetected).toBe("Outreach");
    expect(r.synthesized.publicContentDepth).toBe(1);
    expect(r.steps).toBe(2);
    // ledger starts empty when no tool ran (the mocked loop didn't execute tools)
    expect(r.attempted).toBe(0);
  });

  it("passes the agent params to tracedGenerateText (tools + stopWhen + output + trace)", async () => {
    vi.mocked(tracedGenerateText).mockResolvedValue({
      experimental_output: {
        websiteSummary: null, painPoints: [], bestAngle: null, competitorDetected: null,
        communicationStyle: null, publicContent: [], warmthSignals: [],
      },
      steps: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await runResearchAgent({ tenantId: "t1", companyName: "Acme", domain: "acme.com", contact: null, maxSteps: 5 });
    const call = vi.mocked(tracedGenerateText).mock.calls[0][0];
    expect(call.tools).toBeTruthy();
    expect(call.stopWhen).toBeTruthy();
    expect((call as { experimental_output?: unknown }).experimental_output).toBeTruthy();
    expect(call._trace).toMatchObject({ agentId: "research-agent-brief", tenantId: "t1" });
  });
});

describe("routeStep — model routing", () => {
  it("step 0 keeps the default (Sonnet); step>0 routes to Haiku", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(routeStep({ stepNumber: 0 } as any)).toEqual({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(routeStep({ stepNumber: 2 } as any)).toMatchObject({ model: { id: "haiku" } });
  });
});
