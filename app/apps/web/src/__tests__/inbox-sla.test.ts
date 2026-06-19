import { describe, it, expect } from "vitest";
import { checkSla } from "@/lib/inbox/sla";

const HOUR = 3_600_000;
const NOW = 1_750_000_000_000;

describe("checkSla (INBOX-N04)", () => {
  it("breaches when awaiting our reply past the threshold", () => {
    const r = checkSla({ awaitingOurReply: true, lastInboundAt: NOW - 30 * HOUR, now: NOW, thresholdHours: 24 });
    expect(r.breached).toBe(true);
    expect(r.hoursOver).toBe(6);
  });

  it("does not breach within the threshold", () => {
    expect(checkSla({ awaitingOurReply: true, lastInboundAt: NOW - 10 * HOUR, now: NOW, thresholdHours: 24 }).breached).toBe(false);
  });

  it("never breaches when not awaiting our reply", () => {
    expect(checkSla({ awaitingOurReply: false, lastInboundAt: NOW - 100 * HOUR, now: NOW, thresholdHours: 24 }).breached).toBe(false);
  });

  it("never breaches with no inbound timestamp", () => {
    expect(checkSla({ awaitingOurReply: true, lastInboundAt: null, now: NOW, thresholdHours: 24 }).breached).toBe(false);
  });
});
