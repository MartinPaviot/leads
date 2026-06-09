import { describe, it, expect } from "vitest";
import { scopeAllowsGoogleSend, scopeAllowsMicrosoftSend } from "../oauth-send-scope";

describe("scopeAllowsGoogleSend", () => {
  it("allows when gmail.send is in the grant", () => {
    expect(
      scopeAllowsGoogleSend(
        "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
      ),
    ).toBe(true);
  });
  it("denies a read-only grant", () => {
    expect(
      scopeAllowsGoogleSend("openid email https://www.googleapis.com/auth/gmail.readonly"),
    ).toBe(false);
  });
  it("does not match gmail.sendAs-style prefixes by accident", () => {
    expect(scopeAllowsGoogleSend("https://www.googleapis.com/auth/gmail.send.metadata")).toBe(false);
  });
  it("denies null/empty", () => {
    expect(scopeAllowsGoogleSend(null)).toBe(false);
    expect(scopeAllowsGoogleSend("")).toBe(false);
  });
});

describe("scopeAllowsMicrosoftSend", () => {
  it("allows when Mail.Send is in the grant (case-insensitive)", () => {
    expect(scopeAllowsMicrosoftSend("openid Mail.Read Mail.Send Calendars.Read")).toBe(true);
    expect(scopeAllowsMicrosoftSend("mail.send")).toBe(true);
  });
  it("denies a read-only grant", () => {
    expect(scopeAllowsMicrosoftSend("openid Mail.Read Calendars.Read")).toBe(false);
  });
  it("denies null/empty", () => {
    expect(scopeAllowsMicrosoftSend(null)).toBe(false);
  });
});
