import { describe, it, expect } from "vitest";
import { resolveInboxView } from "@/lib/inbox/inbox-view";

const base = { lane: "attention", activeSplit: null, selectedMailbox: null, search: "" };

describe("resolveInboxView — primary mapping", () => {
  it("bare attention lane → primary, no split", () => {
    const v = resolveInboxView(base);
    expect(v.effLane).toBe("primary");
    expect(v.splitId).toBe("");
    expect(v.cacheKey).toBe("primary||");
  });

  it('the "other" split is still the primary view (not sub-segmented)', () => {
    const v = resolveInboxView({ ...base, activeSplit: "other" });
    expect(v.effLane).toBe("primary");
    expect(v.splitId).toBe("");
    expect(v.cacheKey).toBe("primary||");
  });

  it("a real split on attention sub-segments (effLane stays attention)", () => {
    const v = resolveInboxView({ ...base, activeSplit: "needs_reply" });
    expect(v.effLane).toBe("attention");
    expect(v.splitId).toBe("needs_reply");
    expect(v.cacheKey).toBe("attention||needs_reply");
  });

  it("a split only applies on the attention lane, never elsewhere", () => {
    // A stray activeSplit while on the Done folder must not leak into the query.
    const v = resolveInboxView({ ...base, lane: "done", activeSplit: "needs_reply" });
    expect(v.effLane).toBe("done");
    expect(v.splitId).toBe("");
    expect(v.cacheKey).toBe("done||");
  });
});

describe("resolveInboxView — folders + custom lanes", () => {
  it.each(["done", "snoozed", "handled", "starred", "drafts", "scheduled", "all", "trash", "spam"])(
    "folder %s maps to itself with no split",
    (lane) => {
      const v = resolveInboxView({ ...base, lane });
      expect(v.effLane).toBe(lane);
      expect(v.splitId).toBe("");
      expect(v.cacheKey).toBe(`${lane}||`);
    },
  );

  it("a custom-lane UUID maps to itself", () => {
    const id = "8d9aa9ea-0523-4169-b7d4-60943ca77c8c";
    const v = resolveInboxView({ ...base, lane: id });
    expect(v.effLane).toBe(id);
    expect(v.cacheKey).toBe(`${id}||`);
  });
});

describe("resolveInboxView — cache key isolation", () => {
  it("the focused mailbox is part of the key (no cross-mailbox collision)", () => {
    const a = resolveInboxView({ ...base, selectedMailbox: "mbA" });
    const b = resolveInboxView({ ...base, selectedMailbox: "mbB" });
    expect(a.cacheKey).toBe("primary|mbA|");
    expect(b.cacheKey).toBe("primary|mbB|");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });

  it("two different splits never share a key", () => {
    const nr = resolveInboxView({ ...base, activeSplit: "needs_reply" });
    const fu = resolveInboxView({ ...base, activeSplit: "follow_ups" });
    expect(nr.cacheKey).not.toBe(fu.cacheKey);
  });
});

describe("resolveInboxView — caching policy", () => {
  it("non-search views are cacheable", () => {
    expect(resolveInboxView(base).canCache).toBe(true);
  });
  it("search views are never cached (transient)", () => {
    expect(resolveInboxView({ ...base, search: "acme" }).canCache).toBe(false);
  });
});
