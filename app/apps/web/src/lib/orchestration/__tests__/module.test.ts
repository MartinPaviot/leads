import { describe, it, expect } from "vitest";
import { moduleOptions, moduleIdempotencyKey, failModule, PermanentError } from "../module";

describe("moduleOptions (AC1/AC4 — house defaults)", () => {
  it("applies bounded retries (default 3) + triggers", () => {
    const o = moduleOptions({ name: "demo", triggers: [{ event: "demo.run" }] });
    expect(o.id).toBe("demo");
    expect(o.retries).toBe(3);
    expect(o.triggers).toEqual([{ event: "demo.run" }]);
    expect(o.concurrency).toBeUndefined();
    expect(o.idempotency).toBeUndefined();
  });
  it("threads tenant-scoped concurrency + native idempotency when configured", () => {
    const o = moduleOptions({
      name: "demo",
      triggers: [{ cron: "* * * * *" }],
      retries: 1,
      concurrencyKey: "event.data.tenantId",
      idempotency: "event.data.ref",
    });
    expect(o.retries).toBe(1);
    expect(o.concurrency).toEqual([{ key: "event.data.tenantId", limit: 5 }]);
    expect(o.idempotency).toBe("event.data.ref");
  });
});

describe("moduleIdempotencyKey", () => {
  it("joins module + non-null parts deterministically", () => {
    expect(moduleIdempotencyKey("enrich", ["t1", "acct", undefined, 7])).toBe("enrich:t1:acct:7");
    expect(moduleIdempotencyKey("enrich", ["t1", "acct", undefined, 7])).toBe(moduleIdempotencyKey("enrich", ["t1", "acct", null, 7]));
  });
});

describe("failModule / PermanentError (AC4 classification)", () => {
  it("permanent failures are NonRetriableError; transient are plain Error", () => {
    expect(() => failModule("bad input", { permanent: true })).toThrow(PermanentError);
    try {
      failModule("rate limited");
      throw new Error("unreachable");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(PermanentError);
    }
  });
});
