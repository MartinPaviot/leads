import { describe, it, expect } from "vitest";
import {
  summarizeThread,
  buildThreadSummaryPrompt,
  type ThreadMessage,
  type ThreadSummary,
} from "@/lib/inbox/summarize-thread";

const msgs: ThreadMessage[] = [
  { direction: "outbound", from: "me@pilae.ch", body: "Intro — can we talk?", at: "2026-06-01T10:00:00Z" },
  { direction: "inbound", from: "anna@acme.ch", body: "Yes, send pricing.", at: "2026-06-02T10:00:00Z" },
  { direction: "outbound", from: "me@pilae.ch", body: "Pricing attached.", at: "2026-06-03T10:00:00Z" },
  { direction: "inbound", from: "anna@acme.ch", body: "Looks good, decision by Friday.", at: "2026-06-04T10:00:00Z" },
];

describe("summarizeThread (INBOX-S01/S08)", () => {
  it("builds a prompt that indexes messages and labels direction", () => {
    const p = buildThreadSummaryPrompt(msgs);
    expect(p).toContain("[0] You:");
    expect(p).toContain("[1] anna@acme.ch:");
    expect(p).toContain("decision by Friday");
  });

  it("maps a generator result and clamps citations to real indices", async () => {
    const gen = async (): Promise<ThreadSummary> => ({
      tldr: "  Awaiting Anna's decision by Friday.  ",
      keyPoints: ["Pricing sent", "  ", "Decision by Friday", "a", "b", "c", "d"],
      citations: [1, 3, 99, -1],
    });
    const s = await summarizeThread(msgs, gen);
    expect(s.tldr).toBe("Awaiting Anna's decision by Friday.");
    expect(s.keyPoints).toEqual(["Pricing sent", "Decision by Friday", "a", "b", "c"]); // trimmed, blanks dropped, capped 5
    expect(s.citations).toEqual([1, 3]); // out-of-range 99 / -1 dropped
  });

  it("fails closed on a generator error and on empty input", async () => {
    const boom = async (): Promise<ThreadSummary> => {
      throw new Error("model down");
    };
    expect(await summarizeThread(msgs, boom)).toEqual({ tldr: "", keyPoints: [], citations: [] });
    expect(await summarizeThread([], async () => ({ tldr: "x", keyPoints: [], citations: [] }))).toEqual({
      tldr: "",
      keyPoints: [],
      citations: [],
    });
  });
});
