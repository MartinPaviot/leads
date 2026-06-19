import { describe, it, expect } from "vitest";
import { healthSummary, STALE_MINUTES, SCORE_FLOOR, type MailboxHealthInput } from "@/lib/inbox/mailbox-health";

const NOW = 1_000_000_000_000;
function input(over: Partial<MailboxHealthInput>): MailboxHealthInput {
  return { status: "active", healthScore: 100, needsReauth: false, lastSyncAt: new Date(NOW).toISOString(), lastSyncError: null, now: NOW, ...over };
}

describe("healthSummary", () => {
  it("needs_reauth → error (wins over everything)", () => {
    expect(healthSummary(input({ needsReauth: true, healthScore: 100, lastSyncError: null })).health).toBe("error");
  });
  it("status=error → error", () => {
    expect(healthSummary(input({ status: "error" })).health).toBe("error");
  });
  it("a last sync error → warning", () => {
    expect(healthSummary(input({ lastSyncError: "IMAP timeout" })).health).toBe("warning");
  });
  it("a stale last-sync → warning", () => {
    const stale = new Date(NOW - (STALE_MINUTES + 5) * 60_000).toISOString();
    expect(healthSummary(input({ lastSyncAt: stale })).health).toBe("warning");
  });
  it("a low health score → warning", () => {
    expect(healthSummary(input({ healthScore: SCORE_FLOOR - 1 })).health).toBe("warning");
  });
  it("recent sync, no error, good score → ok", () => {
    expect(healthSummary(input({})).health).toBe("ok");
  });
  it("never-synced (null lastSyncAt) is not stale on its own → ok", () => {
    expect(healthSummary(input({ lastSyncAt: null })).health).toBe("ok");
  });
  it("defaults null status/score sanely", () => {
    const s = healthSummary(input({ status: null, healthScore: null }));
    expect(s.status).toBe("unknown");
    expect(s.healthScore).toBe(100);
    expect(s.health).toBe("ok");
  });
});
