import { describe, it, expect, vi } from "vitest";
import {
  provisionOwnerSmtp,
  summarizeProvision,
  type OwnerSmtpCred,
  type ProvisionDeps,
} from "../provision-owner-smtp";

const cred = (over: Partial<OwnerSmtpCred> = {}): OwnerSmtpCred => ({
  emailAddress: "go@getelevay.com",
  smtpHost: "smtp.zoho.eu",
  smtpPort: 465,
  imapHost: "imap.zoho.eu",
  imapPort: 993,
  password: "s3cret-pw",
  ...over,
});

function deps(over: Partial<ProvisionDeps> = {}): ProvisionDeps {
  return {
    verifySmtp: vi.fn(
      async (_c: { emailAddress: string; smtpHost: string; smtpPort: number | null; password: string }) => undefined,
    ),
    encryptSecret: (p: string) => `enc(${p})`,
    findMailbox: async (_t: string, _e: string) => ({ id: "mbx_1", provider: "instantly" }),
    updateMailbox: vi.fn(
      async (
        _id: string,
        _fields: {
          provider: string;
          smtpHost: string;
          smtpPort: number;
          imapHost: string | null;
          imapPort: number | null;
          secretEncrypted: string;
        },
      ) => undefined,
    ),
    ...over,
  };
}

describe("provisionOwnerSmtp", () => {
  it("verifies the cred THEN converts the row to owner-SMTP (smtp_custom)", async () => {
    const order: string[] = [];
    const d = deps({
      verifySmtp: vi.fn(async (_c: { emailAddress: string; smtpHost: string; smtpPort: number | null; password: string }) => {
        order.push("verify");
      }),
      updateMailbox: vi.fn(
        async (
          _id: string,
          _f: { provider: string; smtpHost: string; smtpPort: number; imapHost: string | null; imapPort: number | null; secretEncrypted: string },
        ) => {
          order.push("update");
        },
      ),
    });
    const [r] = await provisionOwnerSmtp("t1", [cred()], d);
    expect(r).toMatchObject({ emailAddress: "go@getelevay.com", outcome: "converted", detail: "was instantly" });
    expect(order).toEqual(["verify", "update"]); // verify MUST precede the write
  });

  it("writes provider=smtp_custom; encrypts the BARE password and stores the ciphertext", async () => {
    const encrypt = vi.fn((p: string) => `cipher:${p}`);
    const update = vi.fn(
      async (
        _id: string,
        _f: { provider: string; smtpHost: string; smtpPort: number; imapHost: string | null; imapPort: number | null; secretEncrypted: string },
      ) => undefined,
    );
    await provisionOwnerSmtp("t1", [cred({ password: "zoho-app-pw" })], deps({ encryptSecret: encrypt, updateMailbox: update }));
    expect(update).toHaveBeenCalledTimes(1);
    const fields = update.mock.calls[0][1];
    expect(fields.provider).toBe("smtp_custom");
    expect(fields.smtpHost).toBe("smtp.zoho.eu");
    expect(fields.smtpPort).toBe(465);
    expect(fields.imapHost).toBe("imap.zoho.eu");
    expect(fields.imapPort).toBe(993);
    // The BARE password is what gets encrypted (no pre-mangling)...
    expect(encrypt).toHaveBeenCalledWith("zoho-app-pw");
    // ...and what's persisted is the encrypt OUTPUT, not the plaintext.
    expect(fields.secretEncrypted).toBe("cipher:zoho-app-pw");
  });

  it("verify failure → row left UNTOUCHED, outcome verify_failed", async () => {
    const update = vi.fn(
      async (
        _id: string,
        _f: { provider: string; smtpHost: string; smtpPort: number; imapHost: string | null; imapPort: number | null; secretEncrypted: string },
      ) => undefined,
    );
    const [r] = await provisionOwnerSmtp(
      "t1",
      [cred()],
      deps({
        verifySmtp: async () => {
          throw new Error("SMTP login failed — check the email and password (use an app-specific password if 2FA is on).");
        },
        updateMailbox: update,
      }),
    );
    expect(r.outcome).toBe("verify_failed");
    expect(r.detail).toContain("SMTP login failed");
    expect(update).not.toHaveBeenCalled();
  });

  it("verifyOnly → verifies but writes NOTHING (pre-activation dry-run)", async () => {
    const find = vi.fn(async (_t: string, _e: string) => ({ id: "mbx_1", provider: "instantly" }));
    const update = vi.fn(
      async (
        _id: string,
        _f: { provider: string; smtpHost: string; smtpPort: number; imapHost: string | null; imapPort: number | null; secretEncrypted: string },
      ) => undefined,
    );
    const verify = vi.fn(async (_c: { emailAddress: string; smtpHost: string; smtpPort: number | null; password: string }) => undefined);
    const [r] = await provisionOwnerSmtp("t1", [cred()], deps({ verifyOnly: true, findMailbox: find, updateMailbox: update, verifySmtp: verify }));
    expect(r.outcome).toBe("verified_only");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("no matching row → outcome not_found, no write", async () => {
    const update = vi.fn(
      async (
        _id: string,
        _f: { provider: string; smtpHost: string; smtpPort: number; imapHost: string | null; imapPort: number | null; secretEncrypted: string },
      ) => undefined,
    );
    const [r] = await provisionOwnerSmtp("t1", [cred()], deps({ findMailbox: async () => null, updateMailbox: update }));
    expect(r.outcome).toBe("not_found");
    expect(update).not.toHaveBeenCalled();
  });

  it("missing required field → outcome invalid, SMTP never probed", async () => {
    const verify = vi.fn(async (_c: { emailAddress: string; smtpHost: string; smtpPort: number | null; password: string }) => undefined);
    const [r] = await provisionOwnerSmtp("t1", [cred({ password: "" })], deps({ verifySmtp: verify }));
    expect(r.outcome).toBe("invalid");
    expect(verify).not.toHaveBeenCalled();
  });

  it("normalizes the email (trim + lowercase) before verify and lookup", async () => {
    const verify = vi.fn(async (_c: { emailAddress: string; smtpHost: string; smtpPort: number | null; password: string }) => undefined);
    const find = vi.fn(async (_t: string, _e: string) => ({ id: "mbx_1", provider: "instantly" }));
    await provisionOwnerSmtp("t1", [cred({ emailAddress: "  GO@GetElevay.com  " })], deps({ verifySmtp: verify, findMailbox: find }));
    expect(verify.mock.calls[0][0].emailAddress).toBe("go@getelevay.com");
    expect(find.mock.calls[0][1]).toBe("go@getelevay.com");
  });

  it("one bad cred does NOT abort the batch; results stay in input order", async () => {
    const results = await provisionOwnerSmtp(
      "t1",
      [cred({ emailAddress: "ok@getelevay.com" }), cred({ emailAddress: "bad@getelevay.com" }), cred({ emailAddress: "ok2@getelevay.com" })],
      deps({
        verifySmtp: async (c: { emailAddress: string }) => {
          if (c.emailAddress === "bad@getelevay.com") throw new Error("auth failed");
        },
      }),
    );
    expect(results.map((r) => r.emailAddress)).toEqual(["ok@getelevay.com", "bad@getelevay.com", "ok2@getelevay.com"]);
    expect(results.map((r) => r.outcome)).toEqual(["converted", "verify_failed", "converted"]);
  });

  it("summarizeProvision tallies outcomes", () => {
    const tally = summarizeProvision([
      { emailAddress: "a", outcome: "converted" },
      { emailAddress: "b", outcome: "converted" },
      { emailAddress: "c", outcome: "verify_failed" },
      { emailAddress: "d", outcome: "not_found" },
    ]);
    expect(tally).toMatchObject({ converted: 2, verify_failed: 1, not_found: 1, verified_only: 0, invalid: 0 });
  });
});
