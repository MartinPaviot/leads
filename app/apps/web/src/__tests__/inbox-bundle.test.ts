import { describe, it, expect } from "vitest";
import { bundleConversations, type BundleInput } from "@/lib/inbox/bundle";

function item(over: Partial<BundleInput> & { key: string }): BundleInput {
  return {
    fromAddress: "news@substack.com",
    subject: "Weekly digest",
    lastMessageAt: "2026-06-17T08:00:00Z",
    isBulk: true,
    hasOutbound: false,
    ...over,
  };
}

describe("bundleConversations (INBOX-T03)", () => {
  it("groups bulk mail from one sender into a single source", () => {
    const sources = bundleConversations([
      item({ key: "a", lastMessageAt: "2026-06-15T08:00:00Z", subject: "Old" }),
      item({ key: "b", lastMessageAt: "2026-06-17T08:00:00Z", subject: "Newest" }),
      item({ key: "c", lastMessageAt: "2026-06-16T08:00:00Z", subject: "Mid" }),
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0].count).toBe(3);
    expect(sources[0].label).toBe("substack.com");
    expect(sources[0].latestSubject).toBe("Newest"); // most-recent preview
    expect(sources[0].keys.sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps one source per distinct sender, newest source first", () => {
    const sources = bundleConversations([
      item({ key: "a", fromAddress: "news@substack.com", lastMessageAt: "2026-06-15T00:00:00Z" }),
      item({ key: "b", fromAddress: "promo@shop.example", lastMessageAt: "2026-06-17T00:00:00Z" }),
    ]);
    expect(sources.map((s) => s.label)).toEqual(["shop.example", "substack.com"]);
  });

  it("never bundles a conversation that has outbound from us (a real thread)", () => {
    const sources = bundleConversations([item({ key: "a", hasOutbound: true })]);
    expect(sources).toHaveLength(0);
  });

  it("excludes non-bulk conversations", () => {
    const sources = bundleConversations([item({ key: "a", isBulk: false })]);
    expect(sources).toHaveLength(0);
  });

  it("returns [] for no input", () => {
    expect(bundleConversations([])).toEqual([]);
  });
});
