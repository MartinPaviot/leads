import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the underlying assertion helpers so enforce.ts can be exercised without
// a real database. We're testing the flag-gating + call-through behaviour, not
// the assertion logic (that's covered in quota.test.ts).
const assertResourceMock = vi.fn();
const assertMeteredMock = vi.fn();

vi.mock("@/lib/pricing/quota", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pricing/quota")>(
    "@/lib/pricing/quota"
  );
  return {
    ...actual,
    assertResource: (...args: unknown[]) => assertResourceMock(...args),
    assertMetered: (...args: unknown[]) => assertMeteredMock(...args),
  };
});

vi.mock("@/lib/billing", () => ({
  trackUsage: vi.fn().mockResolvedValue(undefined),
}));

import {
  assertContactsHeadroom,
  assertEmailsHeadroom,
  assertAiQueryHeadroom,
  guardedInsertContact,
  guardedInsertContacts,
  guardedSendEmail,
  QuotaExceededError,
} from "@/lib/pricing/enforce";
import { trackUsage } from "@/lib/billing";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  assertResourceMock.mockResolvedValue(undefined);
  assertMeteredMock.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("feature flag PRICING_V2_ENFORCEMENT", () => {
  it("off (default) — assertions are skipped", async () => {
    delete process.env.PRICING_V2_ENFORCEMENT;
    await assertContactsHeadroom("t1");
    await assertEmailsHeadroom("t1");
    await assertAiQueryHeadroom("t1");
    expect(assertResourceMock).not.toHaveBeenCalled();
    expect(assertMeteredMock).not.toHaveBeenCalled();
  });

  it('anything other than "on" is treated as off', async () => {
    process.env.PRICING_V2_ENFORCEMENT = "true";
    await assertContactsHeadroom("t1");
    expect(assertResourceMock).not.toHaveBeenCalled();

    process.env.PRICING_V2_ENFORCEMENT = "1";
    await assertContactsHeadroom("t1");
    expect(assertResourceMock).not.toHaveBeenCalled();

    process.env.PRICING_V2_ENFORCEMENT = "";
    await assertContactsHeadroom("t1");
    expect(assertResourceMock).not.toHaveBeenCalled();
  });

  it('on — assertions run through', async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    await assertContactsHeadroom("t1");
    await assertEmailsHeadroom("t1");
    await assertAiQueryHeadroom("t1");
    expect(assertResourceMock).toHaveBeenCalledWith("t1", "contacts", {
      addingCount: 1,
    });
    expect(assertMeteredMock).toHaveBeenNthCalledWith(1, "t1", "emails");
    expect(assertMeteredMock).toHaveBeenNthCalledWith(2, "t1", "ai_queries");
  });
});

describe("guardedInsertContact(s)", () => {
  it("calls insert when headroom available", async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    const insert = vi.fn().mockResolvedValue([{ id: "c1" }]);
    const result = await guardedInsertContact("t1", insert);
    expect(insert).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: "c1" }]);
  });

  it("surfaces QuotaExceededError from the assertion (no insert call)", async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    assertResourceMock.mockRejectedValueOnce(
      new QuotaExceededError("contacts", 100, 100, "trial")
    );
    const insert = vi.fn();
    await expect(guardedInsertContact("t1", insert)).rejects.toBeInstanceOf(
      QuotaExceededError
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("batch variant passes addingCount to the assertion", async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    const insert = vi.fn().mockResolvedValue([]);
    await guardedInsertContacts("t1", 250, insert);
    expect(assertResourceMock).toHaveBeenCalledWith("t1", "contacts", {
      addingCount: 250,
    });
    expect(insert).toHaveBeenCalledOnce();
  });

  it("with flag off, insert runs even if the assertion would have rejected", async () => {
    delete process.env.PRICING_V2_ENFORCEMENT;
    assertResourceMock.mockRejectedValue(
      new QuotaExceededError("contacts", 100, 100, "trial")
    );
    const insert = vi.fn().mockResolvedValue([{ id: "c1" }]);
    const r = await guardedInsertContact("t1", insert);
    expect(r).toEqual([{ id: "c1" }]);
  });
});

describe("guardedSendEmail", () => {
  it("pre-flights email quota, sends, then tracks usage", async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    const send = vi.fn().mockResolvedValue({ messageId: "abc" });
    const result = await guardedSendEmail("t1", send);
    expect(assertMeteredMock).toHaveBeenCalledWith("t1", "emails");
    expect(send).toHaveBeenCalledOnce();
    expect(trackUsage).toHaveBeenCalledWith("t1", "email_sent", 1);
    expect(result).toEqual({ messageId: "abc" });
  });

  it("send is not attempted if quota is exceeded", async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    assertMeteredMock.mockRejectedValueOnce(
      new QuotaExceededError("emails", 50, 50, "trial")
    );
    const send = vi.fn();
    await expect(guardedSendEmail("t1", send)).rejects.toBeInstanceOf(
      QuotaExceededError
    );
    expect(send).not.toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("trackUsage runs even when enforcement is off (for banner data)", async () => {
    delete process.env.PRICING_V2_ENFORCEMENT;
    const send = vi.fn().mockResolvedValue({ messageId: "xyz" });
    await guardedSendEmail("t1", send);
    expect(assertMeteredMock).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
    expect(trackUsage).toHaveBeenCalledWith("t1", "email_sent", 1);
  });

  it("trackUsage failure does not fail the send", async () => {
    process.env.PRICING_V2_ENFORCEMENT = "on";
    (trackUsage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db down")
    );
    const send = vi.fn().mockResolvedValue({ messageId: "ok" });
    const r = await guardedSendEmail("t1", send);
    expect(r).toEqual({ messageId: "ok" });
  });
});
