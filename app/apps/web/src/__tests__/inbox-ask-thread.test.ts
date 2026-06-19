import { describe, it, expect } from "vitest";
import {
  askThread,
  buildAskThreadPrompt,
  type ThreadMessage,
  type ThreadAnswer,
} from "@/lib/inbox/ask-thread";

const msgs: ThreadMessage[] = [
  { direction: "outbound", from: "me@pilae.ch", body: "Intro — can we talk?", at: "2026-06-01T10:00:00Z" },
  { direction: "inbound", from: "anna@acme.ch", body: "Yes, send pricing for 20 seats.", at: "2026-06-02T10:00:00Z" },
  { direction: "outbound", from: "me@pilae.ch", body: "Pricing attached — I'll send the contract Monday.", at: "2026-06-03T10:00:00Z" },
  { direction: "inbound", from: "anna@acme.ch", body: "Looks good, decision by Friday.", at: "2026-06-04T10:00:00Z" },
];

describe("askThread (INBOX-Q07)", () => {
  it("builds a prompt that indexes messages, labels direction, and carries the question", () => {
    const p = buildAskThreadPrompt(msgs, "What did I promise?");
    expect(p).toContain("[0] You:");
    expect(p).toContain("[1] anna@acme.ch:");
    expect(p).toContain("Question: What did I promise?");
    expect(p).toContain("contract Monday");
  });

  it("clamps citations to real indices and dedupes repeats", async () => {
    const gen = async (): Promise<ThreadAnswer> => ({
      answer: "  You promised to send the contract on Monday.  ",
      citations: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 99, -1],
      answered: true,
    });
    const a = await askThread(msgs, "What did I promise?", gen);
    expect(a.answered).toBe(true);
    expect(a.answer).toBe("You promised to send the contract on Monday.");
    expect(a.citations).toEqual([0, 1, 2, 3]); // out-of-range 99/-1 dropped, duplicates collapsed
  });

  it("returns answered=false with no citations when the thread can't answer", async () => {
    const gen = async (): Promise<ThreadAnswer> => ({
      answer: "I couldn't find that in this thread.",
      citations: [0, 1],
      answered: false,
    });
    const a = await askThread(msgs, "What is their budget?", gen);
    expect(a.answered).toBe(false);
    expect(a.citations).toEqual([]); // citations dropped when not answered
    expect(a.answer).toContain("couldn't find");
  });

  it("downgrades to a non-answer when the model claims answered but returns empty text", async () => {
    const gen = async (): Promise<ThreadAnswer> => ({ answer: "   ", citations: [0], answered: true });
    const a = await askThread(msgs, "anything?", gen);
    expect(a).toEqual({ answer: "I couldn't find that in this thread.", citations: [], answered: false });
  });

  it("fails closed on a generator error, empty input, and a blank question", async () => {
    const boom = async (): Promise<ThreadAnswer> => {
      throw new Error("model down");
    };
    const expected = { answer: "I couldn't find that in this thread.", citations: [], answered: false };
    expect(await askThread(msgs, "q?", boom)).toEqual(expected);
    expect(await askThread([], "q?", async () => ({ answer: "x", citations: [], answered: true }))).toEqual(expected);
    expect(await askThread(msgs, "   ", async () => ({ answer: "x", citations: [], answered: true }))).toEqual(expected);
  });
});
