import { describe, it, expect } from "vitest";
import {
  idlePhase,
  secondsUntilLogout,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
} from "@/lib/auth/idle-timeout";

describe("idlePhase", () => {
  it("is active well before the timeout", () => {
    expect(idlePhase(0)).toBe("active");
    expect(idlePhase(IDLE_TIMEOUT_MS - IDLE_WARNING_MS - 1)).toBe("active");
  });
  it("enters warning inside the warning window", () => {
    expect(idlePhase(IDLE_TIMEOUT_MS - IDLE_WARNING_MS)).toBe("warning");
    expect(idlePhase(IDLE_TIMEOUT_MS - 1)).toBe("warning");
  });
  it("is expired at or after the timeout", () => {
    expect(idlePhase(IDLE_TIMEOUT_MS)).toBe("expired");
    expect(idlePhase(IDLE_TIMEOUT_MS + 5_000)).toBe("expired");
  });
  it("honors custom thresholds", () => {
    expect(idlePhase(5_000, 10_000, 3_000)).toBe("active");
    expect(idlePhase(7_000, 10_000, 3_000)).toBe("warning");
    expect(idlePhase(10_000, 10_000, 3_000)).toBe("expired");
  });
});

describe("secondsUntilLogout", () => {
  it("counts whole seconds and rounds up", () => {
    expect(secondsUntilLogout(IDLE_TIMEOUT_MS - 60_000)).toBe(60);
    expect(secondsUntilLogout(IDLE_TIMEOUT_MS - 1_500)).toBe(2);
  });
  it("clamps at zero past the timeout", () => {
    expect(secondsUntilLogout(IDLE_TIMEOUT_MS)).toBe(0);
    expect(secondsUntilLogout(IDLE_TIMEOUT_MS + 99_999)).toBe(0);
  });
});
