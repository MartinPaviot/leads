import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { isPasswordPwned } from "@/lib/password-pwned";

function sha1Upper(s: string): string {
  return createHash("sha1").update(s).digest("hex").toUpperCase();
}

function makeFetch(
  bodyOrError:
    | string
    | { ok: false; status?: number }
    | { throws: unknown }
): typeof fetch {
  return (async () => {
    if (typeof bodyOrError === "string") {
      return new Response(bodyOrError, { status: 200 });
    }
    if ("throws" in bodyOrError) {
      throw bodyOrError.throws;
    }
    return new Response("", { status: bodyOrError.status ?? 500 });
  }) as unknown as typeof fetch;
}

describe("isPasswordPwned", () => {
  it("flags a password whose hash suffix appears in the response", async () => {
    const password = "Password1!";
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    const body = `${suffix}:42\nDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD:1`;
    const res = await isPasswordPwned(password, makeFetch(body));
    expect(res.pwned).toBe(true);
    expect(res.count).toBe(42);
    expect(res.failOpen).toBeUndefined();
  });

  it("does not flag a password whose hash suffix is absent", async () => {
    const body = "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD:1\nFEED1234567890ABCDEFFEED1234567890AB:7";
    const res = await isPasswordPwned("YxQ_28-rare#novel", makeFetch(body));
    expect(res.pwned).toBe(false);
    expect(res.count).toBe(0);
  });

  it("ignores padding rows (count = 0) — Add-Padding response shape", async () => {
    const password = "ZeroCountIsNotAHit42!";
    const suffix = sha1Upper(password).slice(5);
    const body = `${suffix}:0`;
    const res = await isPasswordPwned(password, makeFetch(body));
    expect(res.pwned).toBe(false);
  });

  it("fails open on non-200 HIBP responses", async () => {
    const res = await isPasswordPwned("anything", makeFetch({ ok: false, status: 503 }));
    expect(res.pwned).toBe(false);
    expect(res.failOpen).toBe(true);
  });

  it("fails open when the request throws (timeout / DNS / abort)", async () => {
    const res = await isPasswordPwned(
      "anything",
      makeFetch({ throws: new Error("timeout") })
    );
    expect(res.pwned).toBe(false);
    expect(res.failOpen).toBe(true);
  });

  it("returns not-pwned for empty / non-string input without hitting the network", async () => {
    const fetchSpy = vi.fn();
    const res = await isPasswordPwned("", fetchSpy as unknown as typeof fetch);
    expect(res.pwned).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("matches case-insensitively on the suffix (HIBP returns uppercase)", async () => {
    const password = "Tr0ub4dor&3xtra";
    const suffix = sha1Upper(password).slice(5).toLowerCase();
    const body = `${suffix}:5`;
    const res = await isPasswordPwned(password, makeFetch(body));
    expect(res.pwned).toBe(true);
    expect(res.count).toBe(5);
  });
});
