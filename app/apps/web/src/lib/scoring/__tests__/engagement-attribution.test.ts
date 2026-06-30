import { describe, it, expect, vi } from "vitest";

// signal-outcomes.ts imports @/db at module load; the functions under test
// are pure, so a stub is enough to keep the import hermetic.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ signalOutcomes: {}, deals: {}, companies: {} }));

import { detectArraySignals, dedupeBySignalType } from "../signal-outcomes";

const asOf = new Date("2026-03-01T00:00:00Z");
const daysBefore = (n: number) => new Date(asOf.getTime() - n * 86_400_000).toISOString();
const daysAfter = (n: number) => new Date(asOf.getTime() + n * 86_400_000).toISOString();

describe("detectArraySignals", () => {
  it("returns [] when there is no signals array", () => {
    expect(detectArraySignals({}, asOf)).toEqual([]);
    expect(detectArraySignals({ signals: "nope" }, asOf)).toEqual([]);
  });

  it("attributes a fresh engagement signal under its own type", () => {
    const props = { signals: [{ type: "positive_reply", detectedAt: daysBefore(5) }] };
    expect(detectArraySignals(props, asOf).map((o) => o.signalType)).toEqual(["positive_reply"]);
  });

  it("canonicalizes a producer alias onto its learned family", () => {
    const props = { signals: [{ type: "funding_recent", detectedAt: daysBefore(10) }] };
    expect(detectArraySignals(props, asOf)[0].signalType).toBe("funding");
  });

  it("drops a stale signal (past its TTL at deal creation)", () => {
    // positive_reply TTL = 14 days.
    const props = { signals: [{ type: "positive_reply", detectedAt: daysBefore(30) }] };
    expect(detectArraySignals(props, asOf)).toEqual([]);
  });

  it("keeps a signal that fired during the cycle (after deal creation)", () => {
    const props = { signals: [{ type: "email_clicked", detectedAt: daysAfter(10) }] };
    expect(detectArraySignals(props, asOf).map((o) => o.signalType)).toEqual(["email_clicked"]);
  });

  it("never expires a structural signal (null TTL)", () => {
    const props = { signals: [{ type: "warm_connection", detectedAt: daysBefore(400) }] };
    expect(detectArraySignals(props, asOf).map((o) => o.signalType)).toEqual(["warm_connection"]);
  });

  it("skips malformed entries (missing/empty type, unparseable date) without throwing", () => {
    const props = {
      signals: [
        { type: "positive_reply", detectedAt: "not-a-date" },
        { type: "", detectedAt: daysBefore(1) },
        { detectedAt: daysBefore(1) },
        null,
      ],
    };
    expect(detectArraySignals(props as Record<string, unknown>, asOf)).toEqual([]);
  });
});

describe("dedupeBySignalType", () => {
  it("keeps the first row per type (structured detection wins over the array alias)", () => {
    const structuredFunding = { signalType: "funding", firedAt: new Date(1) };
    const aliasFunding = { signalType: "funding", firedAt: new Date(2) };
    const reply = { signalType: "positive_reply", firedAt: new Date(3) };
    expect(dedupeBySignalType([structuredFunding, aliasFunding, reply])).toEqual([
      structuredFunding,
      reply,
    ]);
  });
});
