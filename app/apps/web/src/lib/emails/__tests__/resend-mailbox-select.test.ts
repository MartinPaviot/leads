import { describe, it, expect } from "vitest";
import { pickResendEligibleMailbox } from "../resend-mailbox-select";

const mb = (id: string, provider: string, sentToday: number, effectiveLimit: number) =>
  ({ id, provider, sentToday, effectiveLimit });

describe("pickResendEligibleMailbox", () => {
  it("never picks an instantly mailbox (no Resend/SMTP send path)", () => {
    const best = pickResendEligibleMailbox([mb("i", "instantly", 0, 50), mb("s", "smtp_custom", 10, 50)]);
    expect(best?.id).toBe("s");
  });

  it("returns null when EVERY mailbox is instantly → mail is held, not mis-routed", () => {
    expect(pickResendEligibleMailbox([mb("i1", "instantly", 0, 50), mb("i2", "instantly", 0, 50)])).toBeNull();
  });

  it("returns null for an empty pool", () => {
    expect(pickResendEligibleMailbox([])).toBeNull();
  });

  it("picks the lowest sentToday/limit ratio among sendable boxes", () => {
    const best = pickResendEligibleMailbox([
      mb("a", "smtp_custom", 40, 50), // 0.8
      mb("b", "resend", 5, 50),       // 0.1
      mb("c", "gmail", 25, 50),       // 0.5
    ]);
    expect(best?.id).toBe("b");
  });

  it("falls back to the first sendable box when all are at/over cap", () => {
    const best = pickResendEligibleMailbox([
      mb("i", "instantly", 0, 50),    // excluded
      mb("a", "smtp_custom", 50, 50), // at cap
      mb("b", "resend", 60, 50),      // over cap
    ]);
    expect(best?.id).toBe("a"); // first sendable, not the instantly box
  });

  it("treats a null/empty provider as sendable (legacy rows)", () => {
    const best = pickResendEligibleMailbox([{ id: "x", provider: null, sentToday: 0, effectiveLimit: 50 }]);
    expect(best?.id).toBe("x");
  });

  it("provider match is case-insensitive (Instantly, INSTANTLY)", () => {
    expect(pickResendEligibleMailbox([mb("i", "Instantly", 0, 50)])).toBeNull();
    expect(pickResendEligibleMailbox([mb("i", "INSTANTLY", 0, 50)])).toBeNull();
  });
});
