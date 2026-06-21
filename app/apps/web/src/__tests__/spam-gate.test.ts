import { describe, it, expect } from "vitest";
import { decideSpamGate } from "@/lib/sequence-drafts/spam-gate";
import { checkSpamSignals, type SpamCheckResult, type SpamWarning } from "@/lib/emails/email-spam-check";

const res = (severity: SpamCheckResult["severity"], score: number, warnings: SpamWarning[] = []): SpamCheckResult => ({
  score,
  severity,
  warnings,
});

describe("decideSpamGate — fail-soft (only high blocks)", () => {
  it("passes clean / low / medium", () => {
    expect(decideSpamGate(res("clean", 0)).ok).toBe(true);
    expect(decideSpamGate(res("low", 15)).ok).toBe(true);
    expect(decideSpamGate(res("medium", 49, [{ code: "missing-unsubscribe", message: "x", weight: 20 }])).ok).toBe(true);
  });

  it("blocks high with reason + codes + score", () => {
    const d = decideSpamGate(
      res("high", 80, [
        { code: "subject-all-caps", message: "caps", weight: 20 },
        { code: "excessive-exclamations", message: "bangs", weight: 15 },
        { code: "missing-unsubscribe", message: "unsub", weight: 20 },
      ]),
    );
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.reviewReason).toContain("High spam risk");
      expect(d.reviewReason).toContain("80/100");
      expect(d.codes).toContain("subject-all-caps");
      expect(d.score).toBe(80);
    }
  });

  it("end-to-end with the real checker: spammy -> high -> blocked; clean -> ok", () => {
    const spammy = checkSpamSignals("FREE OFFER!!!", "ACT NOW URGENT WINNER!!! Click here for your FREE prize!!!");
    expect(spammy.severity).toBe("high");
    expect(decideSpamGate(spammy).ok).toBe(false);

    const clean = checkSpamSignals(
      "quick question about your ramp",
      "Hi {{first_name}}, saw you're hiring AEs — are you rethinking your sales ramp? Worth a quick chat? Reply to unsubscribe.",
    );
    expect(["clean", "low", "medium"]).toContain(clean.severity);
    expect(decideSpamGate(clean).ok).toBe(true);
  });
});
