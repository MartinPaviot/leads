import { describe, it, expect, afterEach, vi } from "vitest";
import {
  unipileApiBase,
  toHostedAuthBody,
  toWebhookBody,
  verifyWebhookToken,
  readUnipileConfig,
} from "../http";

describe("toWebhookBody", () => {
  it("maps camelCase → snake_case and omits empty optionals", () => {
    expect(toWebhookBody({ source: "messaging", requestUrl: "https://x/cb" })).toEqual({
      source: "messaging",
      request_url: "https://x/cb",
    });
  });
  it("includes name, account_ids and headers when provided", () => {
    expect(
      toWebhookBody({
        source: "account_status",
        requestUrl: "https://x/cb",
        name: "wh",
        accountIds: ["a1"],
        headers: [{ key: "Unipile-Auth", value: "s" }],
      }),
    ).toEqual({
      source: "account_status",
      request_url: "https://x/cb",
      name: "wh",
      account_ids: ["a1"],
      headers: [{ key: "Unipile-Auth", value: "s" }],
    });
  });
});

describe("unipileApiBase", () => {
  it("appends /api/v1 to a bare DSN host", () => {
    expect(unipileApiBase("https://api8.unipile.com:13443")).toBe("https://api8.unipile.com:13443/api/v1");
  });
  it("is idempotent when already suffixed, and strips trailing slashes", () => {
    expect(unipileApiBase("https://api8.unipile.com:13443/")).toBe("https://api8.unipile.com:13443/api/v1");
    expect(unipileApiBase("https://api8.unipile.com:13443/api/v1")).toBe("https://api8.unipile.com:13443/api/v1");
  });
});

describe("toHostedAuthBody", () => {
  const base = {
    type: "create" as const,
    providers: ["LINKEDIN"],
    apiUrl: "https://api8.unipile.com:13443",
    expiresOn: "2026-06-25T12:00:00.000Z",
    notifyUrl: "https://elevay.dev/api/linkedin/unipile/account-webhook?token=s",
    name: "row-1",
  };

  it("maps camelCase → snake_case and includes the row id as `name`", () => {
    expect(toHostedAuthBody(base)).toEqual({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: "https://api8.unipile.com:13443",
      expiresOn: "2026-06-25T12:00:00.000Z",
      notify_url: "https://elevay.dev/api/linkedin/unipile/account-webhook?token=s",
      name: "row-1",
    });
  });

  it("includes reconnect_account only on a reconnect", () => {
    expect(toHostedAuthBody({ ...base, type: "reconnect", reconnectAccount: "acc_9" })).toMatchObject({
      type: "reconnect",
      reconnect_account: "acc_9",
    });
    // create never carries reconnect_account even if one is passed
    expect(toHostedAuthBody({ ...base, reconnectAccount: "acc_9" })).not.toHaveProperty("reconnect_account");
  });

  it("includes redirect URLs only when provided", () => {
    expect(toHostedAuthBody(base)).not.toHaveProperty("success_redirect_url");
    expect(toHostedAuthBody({ ...base, successRedirectUrl: "https://elevay.dev/ok" })).toMatchObject({
      success_redirect_url: "https://elevay.dev/ok",
    });
  });
});

describe("verifyWebhookToken — fail-closed constant-time token check", () => {
  it("accepts the matching token", () => {
    expect(verifyWebhookToken("https://x/api/cb?token=sekret", "sekret")).toBe(true);
  });
  it("rejects a wrong, missing, or length-mismatched token", () => {
    expect(verifyWebhookToken("https://x/api/cb?token=nope", "sekret")).toBe(false);
    expect(verifyWebhookToken("https://x/api/cb", "sekret")).toBe(false);
    expect(verifyWebhookToken("https://x/api/cb?token=sekre", "sekret")).toBe(false);
  });
  it("rejects when no secret is configured (fail-closed)", () => {
    expect(verifyWebhookToken("https://x/api/cb?token=anything", undefined)).toBe(false);
  });
  it("rejects an unparseable URL", () => {
    expect(verifyWebhookToken("not a url", "sekret")).toBe(false);
  });
});

describe("readUnipileConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns null when DSN or key is missing", () => {
    vi.stubEnv("UNIPILE_DSN", "");
    vi.stubEnv("UNIPILE_API_KEY", "");
    expect(readUnipileConfig()).toBeNull();
  });

  it("reads + trims config and strips a trailing slash on the DSN", () => {
    vi.stubEnv("UNIPILE_DSN", " https://api8.unipile.com:13443/ ");
    vi.stubEnv("UNIPILE_API_KEY", " key_123 ");
    vi.stubEnv("UNIPILE_WEBHOOK_SECRET", " whsec ");
    expect(readUnipileConfig()).toEqual({
      dsn: "https://api8.unipile.com:13443",
      apiKey: "key_123",
      webhookSecret: "whsec",
    });
  });
});
