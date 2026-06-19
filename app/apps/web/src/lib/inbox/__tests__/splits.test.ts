import { describe, it, expect } from "vitest";
import {
  resolveSplit,
  resolveCustomSplit,
  splitCounts,
  BUILT_IN_SPLITS,
  type SplitInput,
  type CustomSplit,
} from "@/lib/inbox/splits";

function input(over: Partial<SplitInput>): SplitInput {
  return {
    lane: "attention",
    replyWorthy: false,
    generalIntent: null,
    isBulk: false,
    awaitingOurReply: false,
    awaitingTheirReply: false,
    ...over,
  };
}

describe("resolveSplit — decision table", () => {
  it("needs_reply: attention + replyWorthy + awaiting our reply", () => {
    expect(resolveSplit(input({ replyWorthy: true, awaitingOurReply: true })).split).toBe("needs_reply");
  });
  it("needs_reply wins over promotions even when bulk-flagged (branch order)", () => {
    expect(resolveSplit(input({ replyWorthy: true, awaitingOurReply: true, isBulk: true })).split).toBe("needs_reply");
  });
  it("follow_ups: attention + awaiting their reply (we sent)", () => {
    expect(resolveSplit(input({ awaitingTheirReply: true })).split).toBe("follow_ups");
  });
  it("promotions: bulk or promotion_newsletter intent", () => {
    expect(resolveSplit(input({ isBulk: true })).split).toBe("promotions");
    expect(resolveSplit(input({ generalIntent: "promotion_newsletter" })).split).toBe("promotions");
  });
  it("social: social or notification intent", () => {
    expect(resolveSplit(input({ generalIntent: "social" })).split).toBe("social");
    expect(resolveSplit(input({ generalIntent: "notification" })).split).toBe("social");
  });
  it("other: fallthrough", () => {
    expect(resolveSplit(input({ generalIntent: "question" })).split).toBe("other");
  });
});

describe("resolveSplit — parity + lane invariants", () => {
  it("never needs_reply without replyWorthy (parity with B1)", () => {
    expect(resolveSplit(input({ replyWorthy: false, awaitingOurReply: true })).split).not.toBe("needs_reply");
  });
  it("never needs_reply outside the attention lane", () => {
    for (const lane of ["done", "snoozed", "handled"] as const) {
      expect(resolveSplit(input({ lane, replyWorthy: true, awaitingOurReply: true })).split).not.toBe("needs_reply");
    }
  });
});

describe("resolveCustomSplit", () => {
  const splits: CustomSplit[] = [
    { id: "vc", name: "Investors", senders: ["sequoia.com"] },
    { id: "boss", name: "Boss", senders: ["ceo@acme.com"] },
  ];
  it("matches by domain", () => {
    expect(resolveCustomSplit("partner@sequoia.com", splits)?.id).toBe("vc");
  });
  it("matches by exact address", () => {
    expect(resolveCustomSplit("ceo@acme.com", splits)?.id).toBe("boss");
  });
  it("first match wins, returns null when nothing matches", () => {
    expect(resolveCustomSplit("ceo@acme.com", [...splits].reverse())?.id).toBe("boss");
    expect(resolveCustomSplit("x@other.com", splits)).toBeNull();
  });
});

describe("splitCounts", () => {
  it("tallies each built-in and sums to the input total", () => {
    const inputs = [
      input({ replyWorthy: true, awaitingOurReply: true }), // needs_reply
      input({ awaitingTheirReply: true }), // follow_ups
      input({ isBulk: true }), // promotions
      input({ generalIntent: "social" }), // social
      input({ generalIntent: "question" }), // other
    ];
    const counts = splitCounts(inputs);
    expect(counts.length).toBe(BUILT_IN_SPLITS.length);
    expect(counts.find((c) => c.id === "needs_reply")!.count).toBe(1);
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(inputs.length);
  });
});
