import { describe, it, expect, vi, afterEach } from "vitest";
import { connectCustomMailbox } from "../instantly-client";

const opts = { apiKey: "k", baseUrl: "https://api.test" };
const input = {
  email: "go@cold-domain.com", firstName: "Cold", lastName: "Sender", password: "smtp-secret",
  smtpHost: "ssl0.ovh.net", smtpPort: 465, imapHost: "ssl0.ovh.net", imapPort: 993,
  warmupCustomFtag: "elevay-warmup",
};

const mockFetch = (status: number, json: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }));

const lastBody = (m: ReturnType<typeof mockFetch>) =>
  JSON.parse((m.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;

afterEach(() => vi.unstubAllGlobals());

describe("connectCustomMailbox", () => {
  it("POSTs a provider_code:1 custom-mailbox create with SMTP+IMAP creds + warmup", async () => {
    const f = mockFetch(200, { id: "acc_1" });
    vi.stubGlobal("fetch", f);
    const r = await connectCustomMailbox(opts, input);
    expect(r).toMatchObject({ ok: true, accountId: "acc_1" });
    expect(f.mock.calls[0][0]).toBe("https://api.test/api/v2/accounts");
    expect(lastBody(f)).toMatchObject({
      email: "go@cold-domain.com",
      provider_code: 1,
      smtp_username: "go@cold-domain.com", smtp_password: "smtp-secret", smtp_host: "ssl0.ovh.net", smtp_port: 465,
      imap_username: "go@cold-domain.com", imap_password: "smtp-secret", imap_host: "ssl0.ovh.net", imap_port: 993,
      warmup: { daily_limit: 10, enable_slow_ramp: true },
      warmup_custom_ftag: "elevay-warmup",
    });
  });

  it("reads `account_id` when the response uses that key instead of `id`", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { account_id: "acc_2", message: "Account created successfully" }));
    expect((await connectCustomMailbox(opts, input)).accountId).toBe("acc_2");
  });

  it("returns ok:false with the error body on a non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetch(400, { message: "Email address is already in use." }));
    const r = await connectCustomMailbox(opts, input);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.errorMessage).toContain("already in use");
  });

  it("honours a custom warmup daily limit and omits the ftag when not given", async () => {
    const f = mockFetch(200, { id: "acc_3" });
    vi.stubGlobal("fetch", f);
    await connectCustomMailbox(opts, { ...input, warmupCustomFtag: undefined, warmupDailyLimit: 25 });
    const body = lastBody(f);
    expect(body.warmup).toMatchObject({ daily_limit: 25, enable_slow_ramp: true });
    expect(body.warmup_custom_ftag).toBeUndefined();
  });
});
