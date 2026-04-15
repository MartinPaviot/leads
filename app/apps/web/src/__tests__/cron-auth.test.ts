import { afterEach, describe, it, expect } from "vitest";
import { verifyCronRequest } from "@/lib/cron-auth";

const CRON_SECRET = "test-cron-secret-abcdef0123456789";

function mkReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/any", {
    method: "GET",
    headers,
  });
}

describe("verifyCronRequest — security regression (C1)", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("accepts a request carrying the exact Bearer secret", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const res = verifyCronRequest(mkReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res).toBeNull();
  });

  it("rejects when no authorization header is sent (the original bypass)", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const res = verifyCronRequest(mkReq({}));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when the secret is wrong", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const res = verifyCronRequest(mkReq({ authorization: "Bearer not-the-secret" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when Bearer prefix is missing", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const res = verifyCronRequest(mkReq({ authorization: CRON_SECRET }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects a secret with extra bytes prepended (length mismatch)", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const res = verifyCronRequest(mkReq({ authorization: `Bearer xx${CRON_SECRET}` }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET is not configured at all (no silent accept)", async () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronRequest(mkReq({ authorization: "Bearer whatever" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it("refuses even a correctly-empty header when CRON_SECRET is unset (undefined !== undefined bug)", async () => {
    // This exact case was the live bypass: the header was absent AND the
    // env var was absent, so `undefined !== undefined` short-circuited
    // to "allowed". The new implementation must never allow this.
    delete process.env.CRON_SECRET;
    const res = verifyCronRequest(mkReq({}));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });
});
