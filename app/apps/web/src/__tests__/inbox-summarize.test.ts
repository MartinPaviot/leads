import { describe, it, expect, vi } from "vitest";
import { buildSummaryPrompt, summarizeMessages, type SummaryInput } from "@/lib/inbox/summarize";

const emails: SummaryInput[] = [
  { index: 0, subject: "Login code", body: "Your verification code is 123456, expires in 10 minutes." },
  { index: 1, subject: "Re: pricing", body: "What does the team plan cost?" },
];

describe("buildSummaryPrompt (INBOX-S02)", () => {
  it("includes each email's subject and body", () => {
    const p = buildSummaryPrompt(emails);
    expect(p).toContain("Login code");
    expect(p).toContain("What does the team plan cost?");
    expect(p).toContain("one-line summary");
  });
});

describe("summarizeMessages", () => {
  it("maps the generator's results by index, trimmed", async () => {
    const gen = vi.fn(async () => ({
      results: [
        { index: 0, summary: "  Login code from your hosting provider  " },
        { index: 1, summary: "Asks the price of the team plan" },
      ],
    }));
    const out = await summarizeMessages(emails, gen);
    expect(out.get(0)).toBe("Login code from your hosting provider");
    expect(out.get(1)).toBe("Asks the price of the team plan");
    expect(gen).toHaveBeenCalledOnce();
  });

  it("drops empty summaries and never fabricates", async () => {
    const out = await summarizeMessages(emails, async () => ({
      results: [{ index: 0, summary: "   " }, { index: 1, summary: "Real summary" }],
    }));
    expect(out.has(0)).toBe(false);
    expect(out.get(1)).toBe("Real summary");
  });

  it("is fail-closed: a generator error yields no summaries", async () => {
    const out = await summarizeMessages(emails, async () => {
      throw new Error("LLM down");
    });
    expect(out.size).toBe(0);
  });

  it("returns an empty map for no input", async () => {
    expect((await summarizeMessages([], async () => ({ results: [] }))).size).toBe(0);
  });
});
