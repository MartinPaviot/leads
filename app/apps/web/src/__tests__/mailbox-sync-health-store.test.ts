import { describe, it, expect } from "vitest";
import { mbKey, getMailboxSyncEntry } from "@/lib/integrations/sync-health";

describe("per-mailbox sync-health store (A4, pure read)", () => {
  it("mbKey namespaces by mailbox id (distinct from the per-connection key)", () => {
    expect(mbKey("abc")).toBe("mb:abc");
    expect(mbKey("abc")).not.toContain(":google");
  });

  it("reads a mailbox entry from tenant settings", () => {
    const settings = { syncHealth: { "mb:b1": { lastSyncAt: "2026-06-20T00:00:00Z", lastSyncOk: "2026-06-20T00:00:00Z" } } };
    const e = getMailboxSyncEntry(settings, "b1");
    expect(e?.lastSyncAt).toBe("2026-06-20T00:00:00Z");
    expect(e?.lastSyncError).toBeUndefined();
  });

  it("returns null for an unknown mailbox or empty/garbage settings", () => {
    expect(getMailboxSyncEntry({ syncHealth: {} }, "b1")).toBeNull();
    expect(getMailboxSyncEntry(null, "b1")).toBeNull();
    expect(getMailboxSyncEntry({ syncHealth: { "mb:b1": 42 } }, "b1")).toBeNull();
  });

  it("does not collide with the per-connection needs_reauth key namespace", () => {
    const settings = {
      syncHealth: {
        "user1:google": { status: "needs_reauth", failingSince: "x" },
        "mb:b1": { lastSyncAt: "2026-06-20T00:00:00Z" },
      },
    };
    expect(getMailboxSyncEntry(settings, "b1")?.lastSyncAt).toBe("2026-06-20T00:00:00Z");
    // the per-connection entry is untouched by the mb read
    expect(getMailboxSyncEntry(settings, "user1")).toBeNull();
  });
});
