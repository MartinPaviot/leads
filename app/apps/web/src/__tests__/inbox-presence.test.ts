import { describe, it, expect } from "vitest";
import { presenceSummary, PRESENCE_HEARTBEAT_MS, PRESENCE_ACTIVE_MS } from "@/lib/inbox/presence";

const names = { u1: "Ada", u2: "Bob", u3: "Cy" };

describe("presenceSummary (INBOX-X03)", () => {
  it("is empty with no viewers", () => {
    expect(presenceSummary([], names)).toBe("");
  });
  it("names one and two viewers", () => {
    expect(presenceSummary([{ userId: "u1", state: "viewing" }], names)).toBe("Ada is here");
    expect(presenceSummary([{ userId: "u1", state: "viewing" }, { userId: "u2", state: "viewing" }], names)).toBe(
      "Ada and Bob are here",
    );
  });
  it("summarises 3+ with an overflow count", () => {
    expect(
      presenceSummary(
        [
          { userId: "u1", state: "viewing" },
          { userId: "u2", state: "viewing" },
          { userId: "u3", state: "viewing" },
        ],
        names,
      ),
    ).toBe("Ada, Bob +1 more here");
  });
  it("marks a drafting viewer", () => {
    expect(presenceSummary([{ userId: "u2", state: "drafting" }], names)).toBe("Bob (drafting) is here");
  });
  it("falls back when a name is unknown", () => {
    expect(presenceSummary([{ userId: "ghost", state: "viewing" }], names)).toBe("Someone is here");
  });
});

describe("presence timing", () => {
  it("polls comfortably inside the active window", () => {
    expect(PRESENCE_HEARTBEAT_MS).toBeLessThan(PRESENCE_ACTIVE_MS);
  });
});
