import { describe, it, expect, vi } from "vitest";
import { activateManagedSending } from "../activate-managed-sending";
import type { CapacityReport } from "../capacity";

const cap = (byProvider: Record<string, number>): CapacityReport => ({
  byMailbox: [],
  totalAvailable: Object.values(byProvider).reduce((s, n) => s + n, 0),
  byProvider,
});

describe("activateManagedSending", () => {
  it("activates when a DNS-authenticated Elevay smtp_custom domain has capacity", async () => {
    const setMode = vi.fn(async () => {});
    const r = await activateManagedSending("t1", {
      loadCapacity: async () => cap({ smtp_custom: 45 }),
      setMode,
    });
    expect(r).toMatchObject({ activated: true, elevayCapacity: 45 });
    expect(setMode).toHaveBeenCalledWith("t1", "elevay-managed-active");
  });

  it("REFUSES (no setMode) when there is no Elevay-owned smtp_custom capacity", async () => {
    const setMode = vi.fn(async () => {});
    const r = await activateManagedSending("t1", {
      loadCapacity: async () => cap({}),
      setMode,
    });
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/no DNS-authenticated Elevay-owned sending domain/i);
    expect(setMode).not.toHaveBeenCalled();
  });

  it("does NOT activate on OAuth (gmail) capacity alone — only an Elevay-owned domain counts", async () => {
    const setMode = vi.fn(async () => {});
    const r = await activateManagedSending("t1", {
      loadCapacity: async () => cap({ gmail: 40 }),
      setMode,
    });
    expect(r.activated).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
  });

  it("a present-but-zero smtp_custom entry still refuses (DNS-unverified domain)", async () => {
    const setMode = vi.fn(async () => {});
    const r = await activateManagedSending("t1", {
      loadCapacity: async () => cap({ smtp_custom: 0 }),
      setMode,
    });
    expect(r.activated).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
  });
});
