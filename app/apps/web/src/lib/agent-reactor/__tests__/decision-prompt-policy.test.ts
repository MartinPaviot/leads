import { describe, it, expect } from "vitest";
import { buildDecisionUserPrompt } from "../decision-prompt";
import type { ReactorContext } from "../types";

const ctx = {
  entity: { type: "deal", label: "Acme", data: {} },
  recentActivities: [],
  activeSequences: [],
  signals: [],
  workItem: null,
  pastActions: [],
  triggerMetadata: {},
} as unknown as ReactorContext;

describe("buildDecisionUserPrompt — policy block", () => {
  it("omits the policy block when none is provided", () => {
    const out = buildDecisionUserPrompt("deal_stale", ctx);
    expect(out).not.toContain("What's worked for this workspace");
    expect(out).toContain("## Decision");
  });

  it("inserts the policy block immediately before the Decision section", () => {
    const block = "## What's worked for this workspace\n- [deal_stale] send_followup → reply_received: avg +0.70 (4 times)";
    const out = buildDecisionUserPrompt("deal_stale", ctx, block);

    const policyIdx = out.indexOf("What's worked for this workspace");
    const decisionIdx = out.indexOf("## Decision");
    expect(policyIdx).toBeGreaterThan(-1);
    // The policy must sit right before the Decision ask so it's fresh in context.
    expect(policyIdx).toBeLessThan(decisionIdx);
  });
});
