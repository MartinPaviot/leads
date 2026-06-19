import { describe, it, expect } from "vitest";
import { suggestNextAction, deriveSituation } from "@/lib/inbox/next-action";

describe("suggestNextAction (INBOX-G05)", () => {
  it("lets the situation override the stage default", () => {
    expect(suggestNextAction("proposal", "objection").action).toBe("Address the objection");
    expect(suggestNextAction("qualified", "no_reply").action).toBe("Follow up");
    expect(suggestNextAction("lead", "meeting_set").action).toBe("Prepare for the meeting");
  });

  it("maps the stage to a concrete next action when replied", () => {
    expect(suggestNextAction("qualified", "replied").action).toBe("Book a demo");
    expect(suggestNextAction("proposal", "replied").action).toBe("Send the contract");
    expect(suggestNextAction("negotiation", "replied").action).toContain("terms");
  });

  it("covers the live deal_stage enum (qualification/demo/trial/won/lost)", () => {
    expect(suggestNextAction("qualification", "replied").action).toBe("Book a demo");
    expect(suggestNextAction("demo", "replied").action).toBe("Send a proposal");
    expect(suggestNextAction("trial", "replied").action).toContain("trial");
    expect(suggestNextAction("won", "replied").action).toContain("onboarding");
    expect(suggestNextAction("lost", "replied").action).toBeTruthy();
  });

  it("always carries a cited why and falls back gracefully", () => {
    const a = suggestNextAction("unknown_stage", "replied");
    expect(a.action).toBeTruthy();
    expect(a.why).toBeTruthy();
  });
});

describe("deriveSituation (INBOX-G05)", () => {
  const NOW = new Date("2026-06-17T12:00:00Z").getTime();
  const msg = (direction: "inbound" | "outbound", at: string) => ({ direction, at });

  it("flags an unresolved objection above everything else", () => {
    const s = deriveSituation(
      { messages: [msg("inbound", "2026-06-17T10:00:00Z")], intelligence: { objections: [{ status: "unresolved" }] } },
      NOW,
    );
    expect(s).toBe("objection");
  });

  it("is 'new' before we've sent anything", () => {
    expect(deriveSituation({ messages: [msg("inbound", "2026-06-17T10:00:00Z")], intelligence: null }, NOW)).toBe("new");
  });

  it("waits on them after our last touch — no_reply, then gone_quiet past a week", () => {
    expect(
      deriveSituation({ messages: [msg("inbound", "x"), msg("outbound", "2026-06-15T10:00:00Z")], intelligence: null }, NOW),
    ).toBe("no_reply");
    expect(
      deriveSituation({ messages: [msg("inbound", "x"), msg("outbound", "2026-06-01T10:00:00Z")], intelligence: null }, NOW),
    ).toBe("gone_quiet");
  });

  it("is 'replied' when their message is the most recent", () => {
    expect(
      deriveSituation({ messages: [msg("outbound", "x"), msg("inbound", "2026-06-17T10:00:00Z")], intelligence: null }, NOW),
    ).toBe("replied");
  });
});
