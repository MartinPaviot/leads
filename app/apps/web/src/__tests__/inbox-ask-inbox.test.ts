import { describe, it, expect } from "vitest";
import {
  tokenize,
  selectRelevantThreads,
  buildAskInboxPrompt,
  askInbox,
  type InboxThread,
} from "@/lib/inbox/ask-inbox";

const msg = (direction: "inbound" | "outbound", from: string, body: string) => ({
  direction,
  from,
  body,
  at: null,
});

const threads: InboxThread[] = [
  { key: "k1", subject: "Pricing question", messages: [msg("inbound", "ada@acme.io", "What is your pricing for 50 seats?")] },
  { key: "k2", subject: "Demo follow-up", messages: [msg("inbound", "bob@beta.io", "Thanks for the demo, looks great")] },
  { key: "k3", subject: "Contract", messages: [msg("inbound", "cy@co.io", "Can you send pricing and the contract?")] },
];

describe("tokenize", () => {
  it("drops stopwords + short tokens, dedupes, lowercases", () => {
    expect(tokenize("What is the PRICING pricing for you?")).toEqual(["pricing"]);
  });
});

describe("selectRelevantThreads (INBOX-Q02)", () => {
  it("ranks threads by term overlap, subject weighted double", () => {
    const sel = selectRelevantThreads(threads, "pricing", 6);
    // k1 has "pricing" in subject (×2) + body; k3 has it in body only.
    expect(sel.map((t) => t.key)).toEqual(["k1", "k3"]);
    expect(sel[0].score).toBeGreaterThan(sel[1].score);
  });

  it("returns [] when the query has no content terms or nothing matches", () => {
    expect(selectRelevantThreads(threads, "the and for")).toEqual([]);
    expect(selectRelevantThreads(threads, "zzz nonexistent")).toEqual([]);
  });

  it("caps to the limit", () => {
    expect(selectRelevantThreads(threads, "pricing contract demo", 1)).toHaveLength(1);
  });
});

describe("buildAskInboxPrompt", () => {
  it("indexes the selected threads and includes the question", () => {
    const sel = selectRelevantThreads(threads, "pricing", 6);
    const prompt = buildAskInboxPrompt(sel, "what about pricing?");
    expect(prompt).toContain("[0]");
    expect(prompt).toContain("Question: what about pricing?");
    expect(prompt).toContain("Pricing question");
  });
});

describe("askInbox (injectable, fail-closed)", () => {
  it("clamps citations to real selected indices", async () => {
    const sel = selectRelevantThreads(threads, "pricing", 6);
    const gen = async () => ({ answer: "They asked about 50-seat pricing.", citations: [0, 9, 0], answered: true });
    const r = await askInbox(sel, "pricing?", gen);
    expect(r.answered).toBe(true);
    expect(r.citations).toEqual([0]); // 9 out of range, dup removed
  });

  it("returns answered=false with no selection or empty question", async () => {
    expect((await askInbox([], "x", async () => ({ answer: "", citations: [], answered: true }))).answered).toBe(false);
    const sel = selectRelevantThreads(threads, "pricing", 6);
    expect((await askInbox(sel, "  ", async () => ({ answer: "x", citations: [], answered: true }))).answered).toBe(false);
  });

  it("fails closed on generator error", async () => {
    const sel = selectRelevantThreads(threads, "pricing", 6);
    const r = await askInbox(sel, "pricing?", async () => {
      throw new Error("model down");
    });
    expect(r.answered).toBe(false);
    expect(r.citations).toEqual([]);
  });

  it("treats a model non-answer as not-found", async () => {
    const sel = selectRelevantThreads(threads, "pricing", 6);
    const r = await askInbox(sel, "pricing?", async () => ({ answer: "Not sure", citations: [], answered: false }));
    expect(r.answered).toBe(false);
  });
});
