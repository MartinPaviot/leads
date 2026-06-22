import { describe, it, expect } from "vitest";
import { buildDraftRow } from "../router";

const base = {
  tenantId: "t1",
  sequenceId: "s1",
  stepId: "st1",
  enrollmentId: "e1",
  contactId: "c1",
  bodyHtml: "<p>hi</p>",
  stepNumber: 1,
};

describe("buildDraftRow — P0-4 spam scoring at generation", () => {
  it("populates spam_* from checkSpamSignals; spammy copy -> high", () => {
    const row = buildDraftRow({
      ...base,
      subject: "FREE OFFER!!!",
      bodyText: "ACT NOW URGENT WINNER!!! Click here for your FREE prize!!!",
    });
    expect(row.spamSeverity).toBe("high");
    expect(row.spamScore).toBeGreaterThanOrEqual(50);
    expect(row.spamWarnings.length).toBeGreaterThan(0);
  });

  it("clean copy -> low/medium severity, warnings array present", () => {
    const row = buildDraftRow({
      ...base,
      subject: "quick question about your ramp",
      bodyText: "Hi {{first_name}}, saw you're hiring AEs — rethinking your ramp? Reply to unsubscribe.",
    });
    expect(["clean", "low", "medium"]).toContain(row.spamSeverity);
    expect(Array.isArray(row.spamWarnings)).toBe(true);
  });
});
