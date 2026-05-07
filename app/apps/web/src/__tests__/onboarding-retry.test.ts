import { describe, it, expect, vi } from "vitest";
import {
  retryDecision,
  computeBackoffMs,
  executeWithRetry,
} from "@/lib/onboarding/retry";

describe("computeBackoffMs", () => {
  it("returns 0 for attempt < 1", () => {
    expect(computeBackoffMs(0, () => 0.5)).toBe(0);
    expect(computeBackoffMs(-3, () => 0.5)).toBe(0);
  });

  it("uses exponential growth multiplied by injected random()", () => {
    // attempt 1 → base 250, random=1 → 250
    expect(computeBackoffMs(1, () => 1)).toBe(250);
    // attempt 2 → base 500, random=1 → 500
    expect(computeBackoffMs(2, () => 1)).toBe(500);
    // attempt 3 → base 1000, random=1 → 1000
    expect(computeBackoffMs(3, () => 1)).toBe(1000);
  });

  it("caps at MAX_DELAY_MS even for high attempt numbers", () => {
    expect(computeBackoffMs(10, () => 1)).toBe(4_000);
  });

  it("returns 0 when random=0 (full-jitter low end)", () => {
    expect(computeBackoffMs(5, () => 0)).toBe(0);
  });

  it("floors fractional results", () => {
    // attempt 1, random=0.987 → 250 * 0.987 = 246.75 → 246
    expect(computeBackoffMs(1, () => 0.987)).toBe(246);
  });
});

describe("retryDecision", () => {
  const baseRandom = () => 0; // deterministic

  it("retries on 500 with 'transient_5xx'", () => {
    const d = retryDecision({
      attempt: 1,
      status: 500,
      hasValidationIssues: false,
      random: baseRandom,
    });
    expect(d.retry).toBe(true);
    expect(d.reason).toBe("transient_5xx");
  });

  it("retries on 502/503/504", () => {
    for (const s of [502, 503, 504]) {
      const d = retryDecision({
        attempt: 1,
        status: s,
        hasValidationIssues: false,
        random: baseRandom,
      });
      expect(d.retry).toBe(true);
    }
  });

  it("retries on 429 with bigger floor", () => {
    const d = retryDecision({
      attempt: 1,
      status: 429,
      hasValidationIssues: false,
      random: baseRandom,
    });
    expect(d.retry).toBe(true);
    expect(d.reason).toBe("rate_limited");
    expect(d.delayMs).toBeGreaterThanOrEqual(1000);
  });

  it("does NOT retry on 400 with validation issues", () => {
    const d = retryDecision({
      attempt: 1,
      status: 400,
      hasValidationIssues: true,
      random: baseRandom,
    });
    expect(d.retry).toBe(false);
    expect(d.reason).toBe("validation_error");
  });

  it("does NOT retry on plain 400/401/403/404", () => {
    for (const s of [400, 401, 403, 404]) {
      const d = retryDecision({
        attempt: 1,
        status: s,
        hasValidationIssues: false,
        random: baseRandom,
      });
      expect(d.retry).toBe(false);
      expect(d.reason).toBe("non_retryable_4xx");
    }
  });

  it("retries on network error (status=null)", () => {
    const d = retryDecision({
      attempt: 1,
      status: null,
      hasValidationIssues: false,
      random: baseRandom,
    });
    expect(d.retry).toBe(true);
    expect(d.reason).toBe("network_error");
  });

  it("stops after MAX_ATTEMPTS regardless of status", () => {
    const d = retryDecision({
      attempt: 3,
      status: 500,
      hasValidationIssues: false,
      random: baseRandom,
    });
    expect(d.retry).toBe(false);
    expect(d.reason).toBe("max_attempts");
  });
});

describe("executeWithRetry", () => {
  it("succeeds on first try when 200", async () => {
    const fn = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const result = await executeWithRetry(fn, { sleep: async () => undefined });
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(1);
    expect(result.retried).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and surfaces final result", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      return n < 2
        ? { status: 503, body: { error: "transient" } }
        : { status: 200, body: { ok: true } };
    });
    const result = await executeWithRetry(fn, {
      sleep: async () => undefined,
      random: () => 0,
    });
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(2);
    expect(result.retried).toBe(true);
  });

  it("does not retry on 400 validation", async () => {
    const fn = vi.fn(async () => ({
      status: 400,
      body: { issues: [{ path: "icp.industry", message: "Required" }] },
    }));
    const result = await executeWithRetry(fn, { sleep: async () => undefined });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
  });

  it("retries on network error (status=null)", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      return n < 2 ? { status: null, body: null } : { status: 200, body: { ok: true } };
    });
    const result = await executeWithRetry(fn, {
      sleep: async () => undefined,
      random: () => 0,
    });
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(2);
  });

  it("stops at MAX_ATTEMPTS even on persistent failure", async () => {
    const fn = vi.fn(async () => ({ status: 500, body: null }));
    const result = await executeWithRetry(fn, { sleep: async () => undefined });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.attempts).toBe(3);
    expect(result.retried).toBe(true);
  });

  it("custom isValidation override is respected", async () => {
    const fn = vi.fn(async () => ({
      status: 400,
      body: { customError: "thing" },
    }));
    const result = await executeWithRetry(fn, {
      sleep: async () => undefined,
      isValidation: (body) =>
        !!body && typeof body === "object" && "customError" in (body as object),
    });
    // Treated as validation → no retry.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
  });
});
