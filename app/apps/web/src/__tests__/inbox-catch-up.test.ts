import { describe, it, expect } from "vitest";
import { selectCatchUp, type CatchUpInput } from "@/lib/inbox/catch-up";

function it_(key: string, lastInboundAt: string | null): CatchUpInput {
  return { key, subject: `Subj ${key}`, lastInboundAt, inboundCount: 1 };
}

describe("selectCatchUp (INBOX-S03)", () => {
  const items = [
    it_("old", "2026-06-15T10:00:00Z"),
    it_("new1", "2026-06-17T09:00:00Z"),
    it_("new2", "2026-06-17T11:00:00Z"),
    it_("none", null),
  ];

  it("selects only conversations with a new inbound after lastSeen, newest first", () => {
    const r = selectCatchUp(items, "2026-06-16T00:00:00Z");
    expect(r.sinceCount).toBe(2);
    expect(r.items.map((i) => i.key)).toEqual(["new2", "new1"]);
  });

  it("includes everything with an inbound when lastSeen is null", () => {
    expect(selectCatchUp(items, null).sinceCount).toBe(3); // excludes the null-inbound one
  });

  it("excludes conversations with no inbound timestamp", () => {
    expect(selectCatchUp(items, "2026-06-16T00:00:00Z").items.some((i) => i.key === "none")).toBe(false);
  });

  it("returns empty when nothing changed", () => {
    expect(selectCatchUp(items, "2026-06-18T00:00:00Z").sinceCount).toBe(0);
  });
});
