import { describe, expect, it } from "vitest";
import { replySignalType } from "@/inngest/engagement-signal";

describe("replySignalType — classified reply → buying signal gate", () => {
  it("treats genuine engagement classifications as a positive_reply signal", () => {
    for (const c of [
      "interested",
      "meeting_request",
      "objection_price",
      "objection_timing",
      "objection_competitor",
      "objection_authority",
    ]) {
      expect(replySignalType(c)).toBe("positive_reply");
    }
  });

  it("does NOT signal on ooo or unsubscribe (not buying intent)", () => {
    expect(replySignalType("ooo")).toBeNull();
    expect(replySignalType("unsubscribe")).toBeNull();
  });

  it("defaults an unlabelled/unknown reply to positive_reply (a reply is engagement)", () => {
    expect(replySignalType(undefined)).toBe("positive_reply");
    expect(replySignalType(null)).toBe("positive_reply");
    expect(replySignalType("some_future_label")).toBe("positive_reply");
  });
});
