import { describe, it, expect } from "vitest";
import { TokenBucketLimiter, NO_LIMIT } from "../rate-limit";

// Deterministic fake clock: sleep advances virtual time instead of waiting.
function fakeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TokenBucketLimiter (AC5)", () => {
  it("allows a burst then paces subsequent acquisitions", async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketLimiter({
      tokensPerInterval: 60,
      intervalMs: 60_000, // 1 token / 1000ms
      burst: 2,
      now: clock.now,
      sleep: clock.sleep,
    });
    const start = clock.now();
    // Two immediate (burst), then the third must wait ~1000ms for a token.
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.now() - start).toBeGreaterThanOrEqual(1000);
  });

  it("honors a 429 Retry-After pause", async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketLimiter({
      tokensPerInterval: 1000,
      intervalMs: 1000,
      burst: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });
    const start = clock.now();
    limiter.onRateLimit(5000);
    await limiter.acquire(); // must wait out the 5s pause despite plenty of tokens
    expect(clock.now() - start).toBeGreaterThanOrEqual(5000);
  });
});

describe("NO_LIMIT", () => {
  it("never blocks", async () => {
    await NO_LIMIT.acquire();
    NO_LIMIT.onRateLimit(10_000);
    await NO_LIMIT.acquire();
    expect(true).toBe(true);
  });
});
