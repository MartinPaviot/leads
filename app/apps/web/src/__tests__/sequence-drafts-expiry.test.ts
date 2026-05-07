import { describe, it, expect } from "vitest";
import {
  resolveExpiryHours,
  expiryCutoff,
  shouldExpire,
} from "@/lib/sequence-drafts/expiry";

describe("resolveExpiryHours", () => {
  it("defaults to 72h when settings is null/undefined/empty", () => {
    expect(resolveExpiryHours(null)).toBe(72);
    expect(resolveExpiryHours(undefined)).toBe(72);
    expect(resolveExpiryHours({})).toBe(72);
  });

  it("returns the value when within [1, 720]", () => {
    expect(resolveExpiryHours({ draftExpiryHours: 24 })).toBe(24);
    expect(resolveExpiryHours({ draftExpiryHours: 168 })).toBe(168);
  });

  it("clamps to MIN_EXPIRY_HOURS (1) when too small", () => {
    expect(resolveExpiryHours({ draftExpiryHours: 0 })).toBe(1);
    expect(resolveExpiryHours({ draftExpiryHours: -5 })).toBe(1);
  });

  it("clamps to MAX_EXPIRY_HOURS (720) when too large", () => {
    expect(resolveExpiryHours({ draftExpiryHours: 9999 })).toBe(720);
  });

  it("falls back to default on non-numeric / NaN / Infinity", () => {
    expect(resolveExpiryHours({ draftExpiryHours: "24" })).toBe(72);
    expect(resolveExpiryHours({ draftExpiryHours: NaN })).toBe(72);
    expect(resolveExpiryHours({ draftExpiryHours: Infinity })).toBe(72);
    expect(resolveExpiryHours({ draftExpiryHours: null })).toBe(72);
  });

  it("floors fractional hours", () => {
    expect(resolveExpiryHours({ draftExpiryHours: 23.7 })).toBe(23);
  });
});

describe("expiryCutoff", () => {
  it("subtracts hours from now correctly", () => {
    const now = new Date("2026-05-07T12:00:00Z");
    const cut = expiryCutoff(now, 24);
    expect(cut.toISOString()).toBe("2026-05-06T12:00:00.000Z");
  });

  it("returns now when hours = 0", () => {
    const now = new Date("2026-05-07T12:00:00Z");
    expect(expiryCutoff(now, 0).getTime()).toBe(now.getTime());
  });
});

describe("shouldExpire", () => {
  const cutoff = new Date("2026-05-04T00:00:00Z"); // 72h before 2026-05-07

  it("expires draft older than cutoff with status pending_approval", () => {
    expect(
      shouldExpire(
        { generatedAt: "2026-05-03T23:00:00Z", status: "pending_approval" },
        cutoff,
      ),
    ).toBe(true);
  });

  it("does not expire draft newer than cutoff", () => {
    expect(
      shouldExpire(
        { generatedAt: "2026-05-04T01:00:00Z", status: "pending_approval" },
        cutoff,
      ),
    ).toBe(false);
  });

  it("does not expire when status is approved/rejected/expired/sent", () => {
    expect(
      shouldExpire(
        { generatedAt: "2026-05-01T00:00:00Z", status: "approved" },
        cutoff,
      ),
    ).toBe(false);
    expect(
      shouldExpire(
        { generatedAt: "2026-05-01T00:00:00Z", status: "rejected" },
        cutoff,
      ),
    ).toBe(false);
    expect(
      shouldExpire(
        { generatedAt: "2026-05-01T00:00:00Z", status: "expired" },
        cutoff,
      ),
    ).toBe(false);
    expect(
      shouldExpire(
        { generatedAt: "2026-05-01T00:00:00Z", status: "sent" },
        cutoff,
      ),
    ).toBe(false);
  });

  it("treats Date and ISO string interchangeably", () => {
    const d = new Date("2026-05-01T00:00:00Z");
    expect(
      shouldExpire({ generatedAt: d, status: "pending_approval" }, cutoff),
    ).toBe(true);
  });

  it("does not expire when generatedAt is unparseable", () => {
    expect(
      shouldExpire(
        { generatedAt: "not-a-date", status: "pending_approval" },
        cutoff,
      ),
    ).toBe(false);
  });

  it("uses strict less-than at the boundary", () => {
    // Exactly at cutoff → not expired (boundary inclusive of survival).
    expect(
      shouldExpire(
        {
          generatedAt: cutoff.toISOString(),
          status: "pending_approval",
        },
        cutoff,
      ),
    ).toBe(false);
  });
});
