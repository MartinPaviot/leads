import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyRank } from "@/lib/inbox/fuzzy";

describe("fuzzyScore (INBOX-K01)", () => {
  it("matches a subsequence and rejects a non-subsequence", () => {
    expect(fuzzyScore("Archive conversation", "arch")).not.toBeNull();
    expect(fuzzyScore("Archive conversation", "xyz")).toBeNull();
  });

  it("scores a contiguous match higher than a scattered one", () => {
    const contiguous = fuzzyScore("snooze", "sno")!;
    const scattered = fuzzyScore("set notes optional", "sno")!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("anything", "")).toBe(0);
  });
});

describe("fuzzyRank", () => {
  const items = [
    { label: "Archive conversation" },
    { label: "Snooze" },
    { label: "Mark as done" },
  ];
  it("filters non-matches and ranks the rest best-first", () => {
    const ranked = fuzzyRank(items, "sno");
    expect(ranked.map((i) => i.label)).toEqual(["Snooze"]);
  });
  it("returns all items for an empty query", () => {
    expect(fuzzyRank(items, "")).toHaveLength(3);
  });
});
