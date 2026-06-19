/**
 * Dead-number classification (T7, _specs/call-lists) — the pure decision that
 * gates auto-termination of a call target. The webhook wiring (recordCall...)
 * is covered by tsc + the live harness; here we pin the dead-vs-NRP rule.
 */
import { describe, it, expect } from "vitest";
import {
  isDeadNumberErrorCode,
  isTerminalCallStatus,
  DEAD_NUMBER_ERROR_CODES,
  TERMINAL_CALL_STATUSES,
} from "@/lib/voice/dead-number";

describe("isDeadNumberErrorCode", () => {
  it("flags only the confirmed invalid-number codes", () => {
    expect(isDeadNumberErrorCode("13224")).toBe(true);
    expect(isDeadNumberErrorCode("21211")).toBe(true);
    expect(isDeadNumberErrorCode(13224)).toBe(true); // numeric form
    expect(isDeadNumberErrorCode(" 13224 ")).toBe(true); // trimmed
  });

  it("does NOT flag a blocked-call code, ambiguous misses, or empties (R8.4 → NRP)", () => {
    expect(isDeadNumberErrorCode("13225")).toBe(false); // BLOCKED — the number may be valid
    expect(isDeadNumberErrorCode("11200")).toBe(false); // http retrieval failure
    expect(isDeadNumberErrorCode("")).toBe(false);
    expect(isDeadNumberErrorCode("  ")).toBe(false);
    expect(isDeadNumberErrorCode(null)).toBe(false);
    expect(isDeadNumberErrorCode(undefined)).toBe(false);
  });
});

describe("isTerminalCallStatus", () => {
  it("recognises every terminal child-leg status", () => {
    for (const s of ["completed", "busy", "no-answer", "failed", "canceled"]) {
      expect(isTerminalCallStatus(s)).toBe(true);
    }
  });

  it("rejects in-flight statuses and junk", () => {
    for (const s of ["ringing", "in-progress", "answered", "queued"]) {
      expect(isTerminalCallStatus(s)).toBe(false);
    }
    expect(isTerminalCallStatus(null)).toBe(false);
    expect(isTerminalCallStatus(undefined)).toBe(false);
  });
});

describe("conservative sets", () => {
  it("the dead set stays small and excludes the blocked code", () => {
    expect(DEAD_NUMBER_ERROR_CODES.has("13225")).toBe(false);
    expect([...DEAD_NUMBER_ERROR_CODES].length).toBeLessThanOrEqual(4);
  });
  it("terminal set excludes ringing", () => {
    expect(TERMINAL_CALL_STATUSES.has("ringing")).toBe(false);
  });
});
