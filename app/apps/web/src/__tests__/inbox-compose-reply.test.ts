import { describe, it, expect } from "vitest";
import { composeReply, buildReplyPrompt, type ReplyDraft } from "@/lib/inbox/compose-reply";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";

const msgs: ThreadMessage[] = [
  { direction: "outbound", from: "me@pilae.ch", body: "Intro — worth a chat?", at: "2026-06-01T10:00:00Z" },
  { direction: "inbound", from: "anna@acme.ch", body: "Maybe — what's pricing for 20 seats?", at: "2026-06-02T10:00:00Z" },
];

describe("compose-reply (INBOX-C01/G08)", () => {
  it("indexes the thread and folds in instructions + context", () => {
    const p = buildReplyPrompt(msgs, { instructions: "Sign off as Martin.", context: "Open deal: Proposal stage." });
    expect(p).toContain("[0] You:");
    expect(p).toContain("[1] anna@acme.ch:");
    expect(p.startsWith("Sign off as Martin.")).toBe(true);
    expect(p).toContain("What you know about them: Open deal: Proposal stage.");
    // The no-already-sent guardrail must be present (casing is incidental — it
    // became a sentence-start "Never imply…" when the no-fabrication clause landed).
    expect(p.toLowerCase()).toContain("never imply the email has already been sent");
  });

  it("maps + trims a generator result", async () => {
    const gen = async (): Promise<ReplyDraft> => ({ subject: "  Re: Intro  ", text: "  20 seats is CHF X. Tue 2pm?  " });
    const d = await composeReply(msgs, {}, gen);
    expect(d).toEqual({ subject: "Re: Intro", text: "20 seats is CHF X. Tue 2pm?" });
  });

  it("returns empty for an empty thread (composer unchanged)", async () => {
    const gen = async (): Promise<ReplyDraft> => ({ subject: "x", text: "y" });
    expect(await composeReply([], {}, gen)).toEqual({ subject: "", text: "" });
  });

  it("fails closed on a generator error", async () => {
    const boom = async (): Promise<ReplyDraft> => {
      throw new Error("model down");
    };
    expect(await composeReply(msgs, {}, boom)).toEqual({ subject: "", text: "" });
  });
});

describe("compose-reply nudge mode (B7 B3.1)", () => {
  it("nudge mode swaps to the gentle follow-up task with never-pushy / no-new-facts constraints", () => {
    const p = buildReplyPrompt(msgs, { mode: "nudge" });
    expect(p).toContain("follow-up nudge");
    expect(p).toContain("went unanswered");
    expect(p).toContain("never pushy");
    expect(p).toContain("no new facts");
    expect(p).toContain("never imply the email has already been sent"); // shared safety
    // It must NOT carry the reply task wording.
    expect(p).not.toContain("Answer their actual question");
    expect(p).not.toContain("Write a complete reply");
  });

  it("default mode is unchanged (reply task), a regression guard", () => {
    const dflt = buildReplyPrompt(msgs);
    const reply = buildReplyPrompt(msgs, { mode: "reply" });
    expect(dflt).toBe(reply);
    expect(dflt).toContain("Write a complete reply");
    expect(dflt).toContain("Answer their actual question");
    expect(dflt).not.toContain("follow-up nudge");
  });

  it("composeReply threads the nudge prompt to the generator and still trims/fails-closed", async () => {
    let seen = "";
    const gen = async (prompt: string): Promise<ReplyDraft> => {
      seen = prompt;
      return { subject: "  Re: Intro  ", text: "  Just floating this back up — still keen?  " };
    };
    const d = await composeReply(msgs, { mode: "nudge" }, gen);
    expect(seen).toContain("follow-up nudge");
    expect(d).toEqual({ subject: "Re: Intro", text: "Just floating this back up — still keen?" });
  });
});
