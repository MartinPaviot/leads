import { describe, expect, it } from "vitest";
import { upsertSignalEntry, personFromSignals, hasAnyHint, type SignalEntry } from "../record-signal";

const sig = (type: string, detectedAt: string, strength?: SignalEntry["strength"]): SignalEntry => ({
  type,
  detectedAt,
  ...(strength ? { strength } : {}),
});

describe("hasAnyHint", () => {
  it("true only with at least one identifying field", () => {
    expect(hasAnyHint(null)).toBe(false);
    expect(hasAnyHint({})).toBe(false);
    expect(hasAnyHint({ title: "VP" })).toBe(false); // title alone can't identify
    expect(hasAnyHint({ contactId: "c1" })).toBe(true);
    expect(hasAnyHint({ name: "Jane" })).toBe(true);
    expect(hasAnyHint({ email: "j@x.com" })).toBe(true);
  });
});

describe("personFromSignals", () => {
  const NOW = new Date("2026-06-27T00:00:00Z");
  it("null when no signal carries a person", () => {
    expect(personFromSignals(null, NOW)).toBeNull();
    expect(personFromSignals([sig("funding", "2026-06-26T00:00:00Z")], NOW)).toBeNull();
  });
  it("returns the person of the FRESHEST signal that has one", () => {
    const signals: SignalEntry[] = [
      { type: "hiring", detectedAt: "2026-06-20T00:00:00Z", person: { name: "Old Manager" } },
      { type: "warm_connection", detectedAt: "2026-06-26T00:00:00Z", person: { contactId: "c9" } },
      { type: "funding", detectedAt: "2026-06-27T00:00:00Z" }, // fresher but no person → skipped
    ];
    expect(personFromSignals(signals, NOW)).toEqual({ contactId: "c9" });
  });
  it("skips signals whose person has no usable field", () => {
    const signals: SignalEntry[] = [
      { type: "a", detectedAt: "2026-06-27T00:00:00Z", person: { title: "VP" } }, // unusable
      { type: "b", detectedAt: "2026-06-25T00:00:00Z", person: { email: "j@x.com" } },
    ];
    expect(personFromSignals(signals, NOW)).toEqual({ email: "j@x.com" });
  });
  it("skips a STALE person-bearing signal (past its TTL) → no hijack", () => {
    // hiring TTL is 30d; this hiring signal is ~70 days old → stale → ignored.
    const signals: SignalEntry[] = [
      { type: "hiring", detectedAt: "2026-04-18T00:00:00Z", person: { name: "Stale Manager", email: "stale@x.com" } },
    ];
    expect(personFromSignals(signals, NOW)).toBeNull();
  });
  it("keeps a null-TTL structural signal (warm_connection) even when old", () => {
    const signals: SignalEntry[] = [
      { type: "warm_connection", detectedAt: "2026-01-01T00:00:00Z", person: { contactId: "c1" } },
    ];
    expect(personFromSignals(signals, NOW)).toEqual({ contactId: "c1" });
  });
  it("a stale hint does NOT win over a fresh one", () => {
    const signals: SignalEntry[] = [
      { type: "hiring", detectedAt: "2026-04-18T00:00:00Z", person: { name: "Stale" } }, // stale (70d, TTL 30)
      { type: "warm_connection", detectedAt: "2026-06-10T00:00:00Z", person: { contactId: "fresh" } },
    ];
    expect(personFromSignals(signals, NOW)).toEqual({ contactId: "fresh" });
  });
});

describe("upsertSignalEntry", () => {
  it("appends a new signal type", () => {
    const out = upsertSignalEntry([], sig("funding", "2026-06-26T00:00:00Z", "high"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "funding", strength: "high" });
  });

  it("keeps other types untouched when adding a new one", () => {
    const start = [sig("hiring", "2026-06-01T00:00:00Z")];
    const out = upsertSignalEntry(start, sig("funding", "2026-06-26T00:00:00Z"));
    expect(out.map((s) => s.type).sort()).toEqual(["funding", "hiring"]);
  });

  it("replaces an existing signal of the same type with the newer entry", () => {
    const start = [sig("funding", "2026-01-01T00:00:00Z", "low")];
    const out = upsertSignalEntry(start, sig("funding", "2026-06-26T00:00:00Z", "high"));
    expect(out).toHaveLength(1);
    expect(out[0].detectedAt).toBe("2026-06-26T00:00:00Z");
    expect(out[0].strength).toBe("high");
  });

  it("does not mutate the input array", () => {
    const start = [sig("funding", "2026-01-01T00:00:00Z")];
    const out = upsertSignalEntry(start, sig("hiring", "2026-06-26T00:00:00Z"));
    expect(start).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it("dedups to one entry per type across repeated upserts", () => {
    let acc: SignalEntry[] = [];
    acc = upsertSignalEntry(acc, sig("funding", "2026-06-01T00:00:00Z"));
    acc = upsertSignalEntry(acc, sig("funding", "2026-06-15T00:00:00Z"));
    acc = upsertSignalEntry(acc, sig("funding", "2026-06-26T00:00:00Z"));
    expect(acc).toHaveLength(1);
    expect(acc[0].detectedAt).toBe("2026-06-26T00:00:00Z");
  });
});
