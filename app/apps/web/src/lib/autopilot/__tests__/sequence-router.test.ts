import { describe, it, expect } from "vitest";
import { resolveSequenceForProspect, type RouterSequence, type SequenceRouterDeps } from "../sequence-router";

const seq = (id: string, over: Partial<RouterSequence> = {}): RouterSequence =>
  ({ id, name: id, icpId: null, campaignConfig: null, ...over });

function deps(sequences: RouterSequence[], routing: { primaryIcpId?: string | null; topSignalType?: string | null } = {}): SequenceRouterDeps {
  return {
    loadActiveSequences: async () => sequences,
    loadCompanyRouting: async () => ({ primaryIcpId: routing.primaryIcpId ?? null, topSignalType: routing.topSignalType ?? null }),
  };
}

describe("resolveSequenceForProspect", () => {
  it("an ICP-bound sequence for the company's primary ICP wins", async () => {
    const r = await resolveSequenceForProspect("t1", "co1", deps(
      [seq("s1", { icpId: "icp-A" }), seq("s2", { icpId: "icp-B" }), seq("s3")],
      { primaryIcpId: "icp-B" },
    ));
    expect(r).toBe("s2");
  });

  it("falls to the trigger-signal match when no ICP-bound sequence", async () => {
    const r = await resolveSequenceForProspect("t1", "co1", deps(
      [seq("cold", { campaignConfig: { triggerSignalTypes: ["hiring_signal"] } }),
       seq("postFunding", { campaignConfig: { triggerSignalTypes: ["post_funding"] } })],
      { topSignalType: "post_funding" },
    ));
    expect(r).toBe("postFunding");
  });

  it("ICP match beats a competing signal match", async () => {
    const r = await resolveSequenceForProspect("t1", "co1", deps(
      [seq("bySignal", { campaignConfig: { triggerSignalTypes: ["post_funding"] } }),
       seq("byIcp", { icpId: "icp-A" })],
      { primaryIcpId: "icp-A", topSignalType: "post_funding" },
    ));
    expect(r).toBe("byIcp");
  });

  it("falls back to the most-recent active sequence (today's behaviour) when nothing matches", async () => {
    const r = await resolveSequenceForProspect("t1", "co1", deps(
      [seq("newest", { campaignConfig: { triggerSignalTypes: ["hiring_signal"] } }),
       seq("older", { campaignConfig: { triggerSignalTypes: ["product_launch"] } })],
      { topSignalType: null }, // no signal → skip signal step → fallback
    ));
    expect(r).toBe("newest"); // sequences[0]
  });

  it("returns null when the tenant has no active sequences", async () => {
    expect(await resolveSequenceForProspect("t1", "co1", deps([]))).toBeNull();
  });
});
