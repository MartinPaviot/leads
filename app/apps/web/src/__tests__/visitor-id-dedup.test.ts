import { describe, it, expect, vi } from "vitest";
import {
  resolveDedupWindowDays,
  dedupCutoff,
  hashIp,
  hashSubnet,
  checkDedup,
} from "@/lib/visitor-id/dedup";

describe("resolveDedupWindowDays", () => {
  it("default 7 when settings absent", () => {
    expect(resolveDedupWindowDays(null)).toBe(7);
    expect(resolveDedupWindowDays({})).toBe(7);
  });

  it("respects explicit setting in [1, 90]", () => {
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: 30 })).toBe(30);
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: 1 })).toBe(1);
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: 90 })).toBe(90);
  });

  it("clamps below 1 → 1", () => {
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: 0 })).toBe(1);
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: -5 })).toBe(1);
  });

  it("clamps above 90 → 90", () => {
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: 365 })).toBe(90);
  });

  it("falls back on non-numeric / NaN / Infinity", () => {
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: "7" })).toBe(7);
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: NaN })).toBe(7);
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: Infinity })).toBe(7);
  });

  it("floors fractional days", () => {
    expect(resolveDedupWindowDays({ visitorIdDedupWindowDays: 3.7 })).toBe(3);
  });
});

describe("dedupCutoff", () => {
  it("subtracts the window from now", () => {
    const now = new Date("2026-05-08T00:00:00Z");
    const cutoff = dedupCutoff(now, 7);
    expect(cutoff.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("returns now when window is 0", () => {
    const now = new Date("2026-05-08T00:00:00Z");
    expect(dedupCutoff(now, 0).getTime()).toBe(now.getTime());
  });
});

describe("hashIp", () => {
  it("produces a 64-char hex string (SHA-256)", () => {
    const h = hashIp("192.168.1.1");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });

  it("trims whitespace before hashing", () => {
    expect(hashIp(" 1.2.3.4  ")).toBe(hashIp("1.2.3.4"));
  });

  it("differs for different inputs", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });
});

describe("hashSubnet", () => {
  it("hashes the /24 subnet for IPv4", () => {
    // 192.168.1.X all map to the same /24 hash.
    const a = hashSubnet("192.168.1.5");
    const b = hashSubnet("192.168.1.99");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs across different /24 subnets", () => {
    expect(hashSubnet("192.168.1.5")).not.toBe(hashSubnet("192.168.2.5"));
  });

  it("returns null for IPv6", () => {
    expect(hashSubnet("2001:db8::1")).toBeNull();
  });

  it("returns null for malformed IPv4", () => {
    expect(hashSubnet("not.an.ip")).toBeNull();
    expect(hashSubnet("1.2.3")).toBeNull();
    expect(hashSubnet("1.2.3.4.5")).toBeNull();
    expect(hashSubnet("256.0.0.1")).toBeNull();
    expect(hashSubnet("-1.0.0.1")).toBeNull();
  });
});

describe("checkDedup", () => {
  const candidate = {
    ipHash: "h-ip",
    subnetHash: "h-subnet",
  };

  it("returns the cached identification when finder hits", async () => {
    const cached = {
      companyDomain: "acme.io",
      companyId: "co-1",
      identifiedAt: new Date("2026-05-06T10:00:00Z"),
      matchedBy: "ip_hash" as const,
    };
    const decision = await checkDedup({
      tenantId: "t-1",
      candidate,
      deps: {
        findRecentIdentification: vi.fn(async () => cached),
        loadTenantSettings: vi.fn(async () => ({})),
      },
    });
    expect(decision.cached).toEqual(cached);
    expect(decision.windowDays).toBe(7);
  });

  it("returns no cached when finder misses", async () => {
    const decision = await checkDedup({
      tenantId: "t-1",
      candidate,
      deps: {
        findRecentIdentification: vi.fn(async () => null),
        loadTenantSettings: vi.fn(async () => ({})),
      },
    });
    expect(decision.cached).toBeNull();
  });

  it("passes the resolved cutoff to the finder", async () => {
    const finderSpy = vi.fn(async () => null);
    const now = new Date("2026-05-08T00:00:00Z");
    await checkDedup({
      tenantId: "t-1",
      candidate,
      now,
      deps: {
        findRecentIdentification: finderSpy,
        loadTenantSettings: vi.fn(async () => ({ visitorIdDedupWindowDays: 14 })),
      },
    });
    const args = finderSpy.mock.calls[0][0];
    expect(args.cutoff.toISOString()).toBe("2026-04-24T00:00:00.000Z");
    expect(args.candidate).toBe(candidate);
    expect(args.tenantId).toBe("t-1");
  });

  it("uses default 7d window when settings missing", async () => {
    const finderSpy = vi.fn(async () => null);
    const now = new Date("2026-05-08T00:00:00Z");
    await checkDedup({
      tenantId: "t-1",
      candidate,
      now,
      deps: {
        findRecentIdentification: finderSpy,
        loadTenantSettings: vi.fn(async () => null),
      },
    });
    expect(finderSpy.mock.calls[0][0].cutoff.toISOString()).toBe(
      "2026-05-01T00:00:00.000Z",
    );
  });
});
