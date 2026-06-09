import { describe, it, expect } from "vitest";
import { shouldUseOwnerSmtp } from "../owner-smtp-decision";

describe("shouldUseOwnerSmtp", () => {
  it("sends via the owner's own SMTP for a custom mailbox with credentials", () => {
    expect(
      shouldUseOwnerSmtp({ provider: "smtp_custom", smtpHost: "smtp.org.ch", secretEncrypted: "enc" }),
    ).toBe(true);
  });

  it("falls back to Resend for OAuth mailboxes (read-only grants, no send scope)", () => {
    expect(shouldUseOwnerSmtp({ provider: "gmail", smtpHost: null, secretEncrypted: null })).toBe(false);
    expect(shouldUseOwnerSmtp({ provider: "outlook", smtpHost: null, secretEncrypted: null })).toBe(false);
  });

  it("falls back to Resend when the sender has no connected mailbox", () => {
    expect(shouldUseOwnerSmtp(null)).toBe(false);
  });

  it("falls back when a custom mailbox is missing its host or secret", () => {
    expect(shouldUseOwnerSmtp({ provider: "smtp_custom", smtpHost: null, secretEncrypted: "enc" })).toBe(false);
    expect(shouldUseOwnerSmtp({ provider: "smtp_custom", smtpHost: "h", secretEncrypted: null })).toBe(false);
  });
});
