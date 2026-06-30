import { describe, it, expect, vi, beforeEach } from "vitest";

const { getBestCombinations } = vi.hoisted(() => ({ getBestCombinations: vi.fn() }));
vi.mock("../stats", () => ({ getBestCombinations }));

import { getActionPolicyBlock } from "../action-policy";

beforeEach(() => {
  getBestCombinations.mockReset();
});

const combo = (over: Record<string, unknown> = {}) => ({
  triggerType: "email_replied",
  actionType: "draft_reply",
  outcomeType: "reply_received",
  count: 5,
  avgPositivity: 0.8,
  ...over,
});

describe("getActionPolicyBlock", () => {
  it('returns "" when there are no combinations', async () => {
    getBestCombinations.mockResolvedValue([]);
    expect(await getActionPolicyBlock("t1")).toBe("");
  });

  it('returns "" when every combo is below the min observation count', async () => {
    getBestCombinations.mockResolvedValue([combo({ count: 2 })]);
    expect(await getActionPolicyBlock("t1")).toBe("");
  });

  it("formats qualifying combos with the header and the guardrail caveat", async () => {
    getBestCombinations.mockResolvedValue([combo()]);
    const out = await getActionPolicyBlock("t1");
    expect(out).toContain("## What's worked for this workspace");
    expect(out).toContain("- [email_replied] draft_reply → reply_received: avg +0.80 (5 times)");
    expect(out.toLowerCase()).toContain("approval guardrails");
  });

  it("orders combos for the current trigger first", async () => {
    getBestCombinations.mockResolvedValue([
      combo({ triggerType: "signal_detected", actionType: "hold", avgPositivity: 0.9, count: 10 }),
      combo({ triggerType: "deal_stale", actionType: "send_followup", avgPositivity: 0.5, count: 4 }),
    ]);
    const out = await getActionPolicyBlock("t1", "deal_stale");
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    // Current trigger surfaces first even though its positivity is lower.
    expect(lines[0]).toContain("[deal_stale]");
    expect(lines[1]).toContain("[signal_detected]");
  });

  it("caps the number of rows", async () => {
    getBestCombinations.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => combo({ actionType: `a${i}`, count: 5 })),
    );
    const out = await getActionPolicyBlock("t1");
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(10);
  });

  it("formats negative positivity with its sign", async () => {
    getBestCombinations.mockResolvedValue([combo({ avgPositivity: -0.3, outcomeType: "no_response" })]);
    const out = await getActionPolicyBlock("t1");
    expect(out).toContain("avg -0.30");
  });

  it('degrades to "" when getBestCombinations throws', async () => {
    getBestCombinations.mockRejectedValue(new Error("db down"));
    expect(await getActionPolicyBlock("t1")).toBe("");
  });
});
