import { describe, it, expect } from "vitest";
import { composeWhyLine } from "@/lib/inbox/why-line";

describe("composeWhyLine (INBOX-S09)", () => {
  it("states the handled note for handled mail, never a guessed reason", () => {
    const w = composeWhyLine({ lane: "handled", handledNote: "Automated sender — no reply needed" });
    expect(w.text).toBe("Automated sender — no reply needed");
  });

  it("composes a grounded, cited sequence-reply line", () => {
    const w = composeWhyLine({ lane: "attention", isSequenceReply: true, intentLabel: "pricing_inquiry" });
    expect(w.text).toBe("Reply to your sequence · asked about pricing");
    expect(w.citations).toEqual(["outbound", "intent"]);
  });

  it("composes a deal + no-reply line", () => {
    const w = composeWhyLine({ lane: "attention", openDealStage: "Proposal", noReplyDays: 6 });
    expect(w.text).toBe("Open deal (Proposal) · no reply in 6 days");
    expect(w.citations).toContain("deal");
    expect(w.citations).toContain("last-interaction");
  });

  it("falls back to the neutral summary when no GTM signal applies", () => {
    const w = composeWhyLine({ lane: "attention", aiSummaryLine: "Verification code, expires soon" });
    expect(w.text).toBe("Verification code, expires soon");
    expect(w.citations).toEqual(["summary"]);
  });

  it("is empty (never fabricated) with no signal and no summary", () => {
    const w = composeWhyLine({ lane: "attention" });
    expect(w.text).toBe("");
    expect(w.text).not.toBe("Replied");
  });

  it("does not attach a sales label on general (non-sequence) mail", () => {
    const w = composeWhyLine({ lane: "attention", isSequenceReply: false, intentLabel: "pricing_inquiry" });
    expect(w.text).toBe(""); // intent ignored without a matched outbound
  });
});
