import { describe, it, expect } from "vitest";
import {
  computeHealthScore,
  suggestNextStage,
  buildNarrative,
} from "@/lib/opportunity-health";

describe("computeHealthScore", () => {
  const base = {
    replies: 0,
    meetings: 0,
    daysSinceLastTouch: Number.POSITIVE_INFINITY,
    hasCloseDate: false,
    hasValue: false,
    hasContact: false,
  };

  it("returns a stalled band with 0 across the board", () => {
    const s = computeHealthScore(base);
    expect(s.band).toBe("stalled");
    expect(s.total).toBe(0);
  });

  it("awards engagement points for replies + meetings", () => {
    const s = computeHealthScore({ ...base, replies: 3, meetings: 2, daysSinceLastTouch: 1 });
    expect(s.components.engagement.score).toBeGreaterThanOrEqual(30);
  });

  it("caps engagement at 40 regardless of reply volume", () => {
    const s = computeHealthScore({ ...base, replies: 50, meetings: 10, daysSinceLastTouch: 1 });
    expect(s.components.engagement.score).toBeLessThanOrEqual(40);
  });

  it("decays freshness linearly past the 7-day threshold", () => {
    const fresh = computeHealthScore({ ...base, daysSinceLastTouch: 3 });
    const stale = computeHealthScore({ ...base, daysSinceLastTouch: 17 });
    expect(fresh.components.freshness.score).toBeGreaterThan(stale.components.freshness.score);
  });

  it("bands at the documented thresholds", () => {
    expect(
      computeHealthScore({ ...base, replies: 3, meetings: 2, daysSinceLastTouch: 0, hasCloseDate: true, hasValue: true, hasContact: true }).band
    ).toBe("strong");
    expect(
      computeHealthScore({ ...base, replies: 1, meetings: 0, daysSinceLastTouch: 10, hasContact: true }).band
    ).toBe("ok");
  });
});

describe("suggestNextStage", () => {
  it("bumps lead → qualification on first inbound reply", () => {
    const s = suggestNextStage("lead", [
      { type: "email_replied", direction: "inbound", occurredAt: new Date(), summary: null },
    ]);
    expect(s?.next).toBe("qualification");
  });

  it("does not advance from lead with no replies", () => {
    expect(suggestNextStage("lead", [])).toBeNull();
  });

  it("bumps qualification → demo when a meeting is scheduled", () => {
    const s = suggestNextStage("qualification", [
      { type: "meeting_scheduled", direction: null, occurredAt: new Date(), summary: null },
    ]);
    expect(s?.next).toBe("demo");
  });

  it("bumps demo → trial only if both meeting_completed + recent email_sent exist", () => {
    const now = new Date();
    const incomplete = suggestNextStage("demo", [
      { type: "meeting_completed", direction: null, occurredAt: now, summary: null },
    ]);
    expect(incomplete).toBeNull();

    const complete = suggestNextStage("demo", [
      { type: "meeting_completed", direction: null, occurredAt: now, summary: null },
      { type: "email_sent", direction: "outbound", occurredAt: now, summary: null },
    ]);
    expect(complete?.next).toBe("trial");
  });

  it("bumps trial → proposal when an activity mentions 'proposal' or 'contract'", () => {
    const s = suggestNextStage("trial", [
      {
        type: "note_created",
        direction: null,
        occurredAt: new Date(),
        summary: "Sent the proposal draft",
      },
    ]);
    expect(s?.next).toBe("proposal");
  });

  it("bumps proposal → negotiation after 2+ inbound replies", () => {
    const now = new Date();
    const s = suggestNextStage("proposal", [
      { type: "email_replied", direction: "inbound", occurredAt: now, summary: null },
      { type: "email_replied", direction: "inbound", occurredAt: now, summary: null },
    ]);
    expect(s?.next).toBe("negotiation");
  });

  it("never auto-advances negotiation / won / lost", () => {
    const acts = Array.from({ length: 10 }, () => ({
      type: "email_replied",
      direction: "inbound" as const,
      occurredAt: new Date(),
      summary: null,
    }));
    expect(suggestNextStage("negotiation", acts)).toBeNull();
    expect(suggestNextStage("won", acts)).toBeNull();
    expect(suggestNextStage("lost", acts)).toBeNull();
  });
});
