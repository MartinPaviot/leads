import { describe, it, expect } from "vitest";
import { resolveAutopilotBudget, coerceConfigBudget } from "../budget";

const r = (over: Partial<Parameters<typeof resolveAutopilotBudget>[0]> = {}) =>
  resolveAutopilotBudget({ configBudget: 100, maxEmailsPerDay: null, capacity: { totalAvailable: 100 }, spentToday: 0, ...over });

describe("resolveAutopilotBudget", () => {
  it("default: config 100, full capacity, nothing spent → 100 email / 0 linkedin", () => {
    expect(r()).toEqual({ email: 100, linkedin: 0 });
  });

  it("clamps to sendable capacity (warmup-safe)", () => {
    expect(r({ capacity: { totalAvailable: 30 } }).email).toBe(30);
  });

  it("honours the maxEmailsPerDay floor when lower than the config budget", () => {
    expect(r({ maxEmailsPerDay: 40 }).email).toBe(40);
  });

  it("null maxEmailsPerDay falls back to the config budget (no floor)", () => {
    expect(r({ maxEmailsPerDay: null, configBudget: 70 }).email).toBe(70);
  });

  it("subtracts what was already sent/enrolled today (idempotency)", () => {
    expect(r({ spentToday: 60 }).email).toBe(40);
  });

  it("never goes negative: spent beyond the ceiling → 0", () => {
    expect(r({ capacity: { totalAvailable: 20 }, spentToday: 50 }).email).toBe(0);
  });

  it("zero capacity → 0 email (no cold send)", () => {
    expect(r({ capacity: { totalAvailable: 0 } }).email).toBe(0);
  });

  it("the binding constraint is the MIN of config / floor / capacity", () => {
    expect(r({ configBudget: 100, maxEmailsPerDay: 80, capacity: { totalAvailable: 25 } }).email).toBe(25);
    expect(r({ configBudget: 30, maxEmailsPerDay: 80, capacity: { totalAvailable: 90 } }).email).toBe(30);
  });

  it("linkedin budget is always 0 (reserved until Unipile)", () => {
    expect(r({ capacity: { totalAvailable: 100 } }).linkedin).toBe(0);
  });

  it("non-finite inputs fail safe (floor to 0, never NaN)", () => {
    expect(r({ capacity: { totalAvailable: Number.NaN } }).email).toBe(0);
    expect(r({ spentToday: Number.NaN }).email).toBe(100);
  });

  it("floors a fractional ceiling", () => {
    expect(r({ capacity: { totalAvailable: 12.9 } }).email).toBe(12);
  });
});

describe("coerceConfigBudget", () => {
  it("passes a valid positive integer through", () => {
    expect(coerceConfigBudget(50, 100)).toBe(50);
  });

  it("accepts 0 — a deliberate per-tenant pause (NOT the fallback)", () => {
    expect(coerceConfigBudget(0, 100)).toBe(0);
  });

  it("floors a fractional setting", () => {
    expect(coerceConfigBudget(42.7, 100)).toBe(42);
  });

  it.each([undefined, null, "100", Number.NaN, Infinity, -5, {}])(
    "falls back to the default for invalid input %p",
    (bad) => {
      expect(coerceConfigBudget(bad, 100)).toBe(100);
    },
  );
});
