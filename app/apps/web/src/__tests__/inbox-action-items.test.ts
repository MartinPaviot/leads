import { describe, it, expect } from "vitest";
import { extractActionItems } from "@/lib/inbox/action-items";

describe("extractActionItems (INBOX-S04)", () => {
  it("extracts a request with a due date", () => {
    const items = extractActionItems("Thanks for the call. Please send me the proposal by 2026-06-20. Talk soon.");
    expect(items).toHaveLength(1);
    expect(items[0].text).toContain("send me the proposal");
    expect(items[0].due).toBe("2026-06-20");
  });

  it("extracts a request with no date as due=null", () => {
    const items = extractActionItems("Can you confirm the meeting time?");
    expect(items).toHaveLength(1);
    expect(items[0].due).toBeNull();
  });

  it("ignores sentences with no action cue", () => {
    expect(extractActionItems("Thanks for your help. Great chatting earlier.")).toHaveLength(0);
  });

  it("extracts multiple items across a message", () => {
    const items = extractActionItems("Please review the deck. Let me know your thoughts. Could you loop in Marie?");
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("returns [] for empty input", () => {
    expect(extractActionItems("")).toEqual([]);
  });
});
