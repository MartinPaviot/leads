/**
 * Unit tests for the pure parts of the daily priority-score cron
 * (B3b). The Inngest function itself is mostly DB I/O; the testable
 * piece is `bestMultiplierForCompany`, the rule that picks one
 * multiplier from the company's `properties.signals` array given a
 * tenant-level lookup table.
 */
import { describe, expect, it } from "vitest";
import { bestMultiplierForCompany } from "@/inngest/signal-score-daily";

describe("bestMultiplierForCompany", () => {
  const multipliers = {
    funding_recent: 2.1,
    hiring: 1.4,
    leadership_change: 1.8,
    tech_stack_change: 0.7, // sub-baseline, should never beat the 1.0 floor
  };

  it("returns 1.0 (neutral) when properties is null", () => {
    expect(bestMultiplierForCompany(null, multipliers)).toBe(1);
  });

  it("returns 1.0 when properties has no signals key", () => {
    expect(bestMultiplierForCompany({ industry: "saas" }, multipliers)).toBe(
      1,
    );
  });

  it("returns 1.0 when signals is an empty array", () => {
    expect(
      bestMultiplierForCompany({ signals: [] }, multipliers),
    ).toBe(1);
  });

  it("returns the single signal's multiplier when there's one match", () => {
    expect(
      bestMultiplierForCompany(
        { signals: [{ type: "hiring" }] },
        multipliers,
      ),
    ).toBe(1.4);
  });

  it("returns the max multiplier across multiple signals", () => {
    expect(
      bestMultiplierForCompany(
        {
          signals: [
            { type: "hiring" },
            { type: "funding_recent" },
            { type: "leadership_change" },
          ],
        },
        multipliers,
      ),
    ).toBe(2.1);
  });

  it("ignores signals not in the multiplier table (unknown type)", () => {
    expect(
      bestMultiplierForCompany(
        {
          signals: [
            { type: "hiring" },
            { type: "obscure_custom_signal" },
          ],
        },
        multipliers,
      ),
    ).toBe(1.4);
  });

  it("floors at 1.0 — a sub-baseline signal does not drag below neutral", () => {
    // tech_stack_change has 0.7 in the table; result should still
    // be 1 (the floor) rather than 0.7 — we never penalise a company
    // for HAVING a signal, the worst case is "as good as no signal".
    expect(
      bestMultiplierForCompany(
        { signals: [{ type: "tech_stack_change" }] },
        multipliers,
      ),
    ).toBe(1);
  });

  it("picks the floor over a single sub-baseline signal even when others are unknown", () => {
    expect(
      bestMultiplierForCompany(
        {
          signals: [
            { type: "tech_stack_change" },
            { type: "obscure" },
          ],
        },
        multipliers,
      ),
    ).toBe(1);
  });

  it("ignores malformed signal entries (no type field)", () => {
    expect(
      bestMultiplierForCompany(
        {
          signals: [{ noType: true }, { type: "funding_recent" }],
        },
        multipliers,
      ),
    ).toBe(2.1);
  });

  it("returns 1.0 when signals is not an array (defensive)", () => {
    expect(
      bestMultiplierForCompany(
        { signals: "funding_recent" },
        multipliers,
      ),
    ).toBe(1);
  });

  it("returns 1.0 when all signals are unknown to the tenant", () => {
    expect(
      bestMultiplierForCompany(
        {
          signals: [
            { type: "a" },
            { type: "b" },
            { type: "c" },
          ],
        },
        {},
      ),
    ).toBe(1);
  });
});
