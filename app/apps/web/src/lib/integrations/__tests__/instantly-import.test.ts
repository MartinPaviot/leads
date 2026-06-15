import { describe, it, expect } from "vitest";
import { instantlyAccountToMailboxRow } from "../instantly-import";

const ctx = { tenantId: "t1" };

describe("instantlyAccountToMailboxRow", () => {
  it("maps a full account to an UNASSIGNED connected_mailboxes row (email lowercased)", () => {
    const row = instantlyAccountToMailboxRow(
      { email: "Alex@Out1.com", first_name: "Alex", last_name: "Doe" },
      ctx,
    );
    expect(row).toEqual({
      tenantId: "t1",
      userId: null,
      emailAddress: "alex@out1.com",
      displayName: "Alex Doe",
      provider: "instantly",
      eeAccountId: "instantly:t1:alex@out1.com",
      domain: "out1.com",
      status: "active",
    });
  });

  it("imports unassigned — ownership is set later by an admin", () => {
    const row = instantlyAccountToMailboxRow({ email: "a@x.com" }, ctx);
    expect(row?.userId).toBeNull();
  });

  it("falls back to the email prefix when no name is present", () => {
    const row = instantlyAccountToMailboxRow({ email: "sales@beta.io" }, ctx);
    expect(row?.displayName).toBe("sales");
    expect(row?.domain).toBe("beta.io");
  });

  it("accepts the email_address field name too (defensive)", () => {
    const row = instantlyAccountToMailboxRow({ email_address: "x@y.com" }, ctx);
    expect(row?.emailAddress).toBe("x@y.com");
  });

  it("returns null for an account with no usable email", () => {
    expect(instantlyAccountToMailboxRow({ first_name: "No" }, ctx)).toBeNull();
    expect(instantlyAccountToMailboxRow({ email: "not-an-email" }, ctx)).toBeNull();
  });

  it("derives a stable, unique ee_account_id per (tenant, mailbox), owner-independent", () => {
    const a = instantlyAccountToMailboxRow({ email: "a@x.com" }, { tenantId: "t1" });
    const b = instantlyAccountToMailboxRow({ email: "a@x.com" }, { tenantId: "t2" });
    expect(a?.eeAccountId).toBe("instantly:t1:a@x.com");
    expect(b?.eeAccountId).toBe("instantly:t2:a@x.com");
    expect(a?.eeAccountId).not.toBe(b?.eeAccountId);
  });
});
