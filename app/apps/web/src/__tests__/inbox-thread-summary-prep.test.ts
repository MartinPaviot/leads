import { describe, it, expect } from "vitest";
import { shouldSummarize, pickKeyMessages } from "@/lib/inbox/thread-summary-prep";

describe("shouldSummarize (INBOX-S08)", () => {
  it("summarizes long threads by count or size", () => {
    expect(shouldSummarize(4, 100)).toBe(true);
    expect(shouldSummarize(2, 5000)).toBe(true);
  });
  it("leaves short threads alone", () => {
    expect(shouldSummarize(2, 200)).toBe(false);
  });
});

describe("pickKeyMessages (INBOX-S01/S08)", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ body: `m${i}`, at: `2026-06-1${i}` }));

  it("returns a short thread unchanged", () => {
    const four = msgs.slice(0, 4);
    expect(pickKeyMessages(four, 6)).toEqual(four);
  });

  it("keeps the opening context plus the latest exchange, in order", () => {
    const picked = pickKeyMessages(msgs, 6);
    expect(picked).toHaveLength(6);
    expect(picked.map((m) => m.body)).toEqual(["m0", "m1", "m6", "m7", "m8", "m9"]);
  });
});
