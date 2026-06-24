import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted (runs before the hoisted ES imports) so the mock factories can
// reference these AND the module sees RESEND_API_KEY at its import-time eval.
const { smtpSend, resendSend } = vi.hoisted(() => {
  process.env.RESEND_API_KEY = "re_test";
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    smtpSend: vi.fn<any>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resendSend: vi.fn<any>(),
  };
});

vi.mock("@/lib/integrations/smtp-send", () => ({ sendViaSmtp: smtpSend }));
vi.mock("@/lib/crypto/settings-encryption", () => ({ decryptSecret: () => "decrypted-pw" }));
vi.mock("resend", () => ({ Resend: class { emails = { send: resendSend }; } }));

import { sendViaMailbox } from "@/lib/emails/mailbox-transport";

const smtpMailbox = {
  emailAddress: "martin@pilae.ch",
  displayName: "Martin",
  provider: "smtp_custom",
  smtpHost: "ssl0.ovh.net",
  smtpPort: 465,
  secretEncrypted: "v1.x.y.z",
};
const oauthMailbox = {
  emailAddress: "martin@gmail.com",
  displayName: "Martin",
  provider: "gmail",
  smtpHost: null,
  smtpPort: null,
  secretEncrypted: null,
};
const payload = { to: "x@a.com", subject: "Hi", html: "<p>hi</p>", text: "hi" };

beforeEach(() => {
  smtpSend.mockReset();
  resendSend.mockReset();
  smtpSend.mockResolvedValue({ messageId: "<smtp-1@pilae.ch>" });
  resendSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });
});

describe("sendViaMailbox transport selection", () => {
  it("smtp_custom mailbox with creds → owner SMTP (rides their domain, no Resend)", async () => {
    const r = await sendViaMailbox(smtpMailbox, payload);
    expect(r).toEqual({ ok: true, messageId: "<smtp-1@pilae.ch>", via: "smtp" });
    expect(smtpSend).toHaveBeenCalledTimes(1);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("OAuth (read-only) mailbox → Resend with the owner's From", async () => {
    const r = await sendViaMailbox(oauthMailbox, payload);
    expect(r).toEqual({ ok: true, messageId: "resend-1", via: "resend" });
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it("propagates a Resend error as { ok:false }", async () => {
    resendSend.mockResolvedValueOnce({ data: null, error: { message: "Domain not verified" } });
    const r = await sendViaMailbox(oauthMailbox, payload);
    expect(r).toEqual({ ok: false, error: "Domain not verified" });
  });

  it("an SMTP throw surfaces as { ok:false } (never reports a phantom send)", async () => {
    smtpSend.mockRejectedValueOnce(new Error("SMTP auth failed"));
    const r = await sendViaMailbox(smtpMailbox, payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("SMTP auth failed");
  });
});
