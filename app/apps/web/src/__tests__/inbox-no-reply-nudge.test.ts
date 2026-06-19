import { describe, it, expect } from "vitest";
import { shouldResurface, type NoReplyInput } from "@/lib/inbox/no-reply-nudge";

const NOW = 1_750_000_000_000;
const DAY = 86_400_000;

function base(over: Partial<NoReplyInput> = {}): NoReplyInput {
  return {
    snoozeIfNoReply: true,
    snoozedUntil: NOW - DAY, // due
    lastInboundAt: null,
    lastOutboundAt: NOW - 3 * DAY,
    outboundBounced: false,
    enrollmentActive: false,
    enrollmentNextRunAt: null,
    now: NOW,
    ...over,
  };
}

describe("shouldResurface (INBOX-T06)", () => {
  it("ignores non-conditional snoozes", () => {
    expect(shouldResurface(base({ snoozeIfNoReply: false })).resurface).toBe(false);
  });

  it("does not resurface before the due time", () => {
    expect(shouldResurface(base({ snoozedUntil: NOW + DAY })).resurface).toBe(false);
  });

  it("does not nudge when the outbound bounced", () => {
    expect(shouldResurface(base({ outboundBounced: true })).resurface).toBe(false);
  });

  it("cancels when a reply arrived after our outbound", () => {
    const d = shouldResurface(base({ lastInboundAt: NOW - DAY }));
    expect(d.resurface).toBe(false);
    expect(d.why).toContain("reply received");
  });

  it("defers to an active sequence that will follow up", () => {
    const d = shouldResurface(base({ enrollmentActive: true, enrollmentNextRunAt: NOW + DAY }));
    expect(d.resurface).toBe(false);
    expect(d.why).toContain("sequence");
  });

  it("resurfaces when due with no reply and no sequence, citing the gap", () => {
    const d = shouldResurface(base());
    expect(d.resurface).toBe(true);
    expect(d.why).toBe("no answer in 3 days");
  });
});
