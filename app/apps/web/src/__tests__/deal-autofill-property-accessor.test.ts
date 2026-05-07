import { describe, it, expect } from "vitest";
import {
  isPropertyEntry,
  getDealProperty,
  getDealPropertyEntry,
  setDealProperty,
  appendToPropertyHistory,
  migrateLegacyProperties,
} from "@/lib/deal-autofill/property-accessor";

describe("isPropertyEntry", () => {
  it("recognises new-shape entry", () => {
    expect(
      isPropertyEntry({
        value: 30000,
        source: "email",
        date: "2026-04-01T00:00:00Z",
        manual: false,
      }),
    ).toBe(true);
  });

  it("rejects raw primitive", () => {
    expect(isPropertyEntry(30000)).toBe(false);
    expect(isPropertyEntry("budget")).toBe(false);
    expect(isPropertyEntry(null)).toBe(false);
    expect(isPropertyEntry(undefined)).toBe(false);
  });

  it("rejects raw array (legacy union shape)", () => {
    expect(isPropertyEntry(["A", "B"])).toBe(false);
  });

  it("rejects nested object that isn't a PropertyEntry", () => {
    expect(isPropertyEntry({ industry: "Devtools", size: 100 })).toBe(false);
    expect(isPropertyEntry({ value: 1 })).toBe(false); // no source/date/manual
    expect(
      isPropertyEntry({ value: 1, source: "x", date: "y" }),
    ).toBe(false); // no manual
  });

  it("requires manual to be boolean", () => {
    expect(
      isPropertyEntry({
        value: 1,
        source: "x",
        date: "y",
        manual: "true" /* string, not bool */,
      }),
    ).toBe(false);
  });
});

describe("getDealProperty — backwards compat", () => {
  it("returns value from new-shape entry", () => {
    const props = {
      budget: {
        value: 50000,
        source: "email",
        date: "2026-04-01",
        manual: false,
      },
    };
    expect(getDealProperty<number>(props, "budget")).toBe(50000);
  });

  it("returns raw value from legacy primitive shape", () => {
    expect(getDealProperty<number>({ budget: 30000 }, "budget")).toBe(30000);
  });

  it("returns raw array from legacy union shape", () => {
    const r = getDealProperty<string[]>(
      { competitors: ["Datadog", "Splunk"] },
      "competitors",
    );
    expect(r).toEqual(["Datadog", "Splunk"]);
  });

  it("returns undefined for missing field", () => {
    expect(getDealProperty({}, "budget")).toBeUndefined();
    expect(getDealProperty(null, "budget")).toBeUndefined();
    expect(getDealProperty(undefined, "budget")).toBeUndefined();
  });
});

describe("getDealPropertyEntry — full attribution", () => {
  it("returns full entry for new-shape", () => {
    const entry = {
      value: 50000,
      source: "email",
      date: "2026-04-01T10:00:00Z",
      manual: false,
      confidence: 0.92,
    };
    const r = getDealPropertyEntry({ budget: entry }, "budget");
    expect(r).toEqual(entry);
  });

  it("synthesises a manual legacy entry from raw primitive", () => {
    const r = getDealPropertyEntry(
      { budget: 30000 },
      "budget",
      "2026-03-01T00:00:00Z",
    );
    expect(r).not.toBeNull();
    expect(r!.value).toBe(30000);
    expect(r!.source).toBe("legacy");
    expect(r!.manual).toBe(true);
    expect(r!.date).toBe("2026-03-01T00:00:00Z");
  });

  it("returns null for missing field", () => {
    expect(getDealPropertyEntry({}, "budget")).toBeNull();
    expect(getDealPropertyEntry(null, "budget")).toBeNull();
  });

  it("falls back to epoch when no fallback date provided", () => {
    const r = getDealPropertyEntry({ budget: 30000 }, "budget");
    expect(r!.date).toBeInstanceOf(Date);
    expect((r!.date as Date).getTime()).toBe(0);
  });
});

describe("setDealProperty — write new-shape", () => {
  it("creates a new properties object (immutable input)", () => {
    const original = { other: "value" };
    const out = setDealProperty(original, "budget", {
      value: 50000,
      source: "email",
      date: new Date("2026-04-01"),
      manual: false,
      confidence: 0.92,
    });
    expect(out).not.toBe(original);
    expect(original).toEqual({ other: "value" }); // unchanged
    expect(out.budget).toMatchObject({
      value: 50000,
      source: "email",
      manual: false,
      confidence: 0.92,
    });
  });

  it("converts Date to ISO string for jsonb storage", () => {
    const out = setDealProperty(null, "budget", {
      value: 1000,
      source: "x",
      date: new Date("2026-04-01T10:00:00.000Z"),
      manual: false,
    });
    expect((out.budget as Record<string, unknown>).date).toBe(
      "2026-04-01T10:00:00.000Z",
    );
  });

  it("omits confidence when undefined", () => {
    const out = setDealProperty(null, "budget", {
      value: 1000,
      source: "manual",
      date: "2026-04-01",
      manual: true,
    });
    expect("confidence" in (out.budget as Record<string, unknown>)).toBe(false);
  });

  it("overwrites existing field", () => {
    const out = setDealProperty(
      { budget: { value: 30000, source: "old", date: "2026-03-01", manual: false } },
      "budget",
      { value: 50000, source: "new", date: "2026-04-01", manual: false },
    );
    expect((out.budget as { value: number }).value).toBe(50000);
  });
});

describe("appendToPropertyHistory", () => {
  it("creates the history array on first write", () => {
    const out = appendToPropertyHistory({}, "budget", {
      value: 30000,
      source: "meeting",
      date: "2026-03-01",
      manual: false,
    });
    expect(Array.isArray(out.budget_history)).toBe(true);
    expect((out.budget_history as unknown[]).length).toBe(1);
  });

  it("appends to existing history", () => {
    const initial = appendToPropertyHistory({}, "budget", {
      value: 25000,
      source: "import",
      date: "2026-02-01",
      manual: false,
    });
    const out = appendToPropertyHistory(initial, "budget", {
      value: 30000,
      source: "meeting",
      date: "2026-03-01",
      manual: false,
    });
    expect((out.budget_history as unknown[]).length).toBe(2);
  });

  it("caps history at maxHistory", () => {
    let acc: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) {
      acc = appendToPropertyHistory(
        acc,
        "budget",
        { value: i, source: "x", date: "2026-04-01", manual: false },
        5,
      );
    }
    expect((acc.budget_history as unknown[]).length).toBe(5);
    // Should be the last 5 (10..14).
    const values = (acc.budget_history as Array<{ value: number }>).map(
      (e) => e.value,
    );
    expect(values).toEqual([10, 11, 12, 13, 14]);
  });
});

describe("migrateLegacyProperties — backfill helper", () => {
  it("wraps every legacy field as manual entry", () => {
    const out = migrateLegacyProperties(
      { budget: 30000, competitors: ["Datadog", "Splunk"] },
      "2026-03-01",
    );
    expect(out.budget).toMatchObject({
      value: 30000,
      source: "legacy",
      manual: true,
    });
    expect(out.competitors).toMatchObject({
      value: ["Datadog", "Splunk"],
      source: "legacy",
      manual: true,
    });
  });

  it("passes new-shape entries through unchanged", () => {
    const entry = {
      value: 50000,
      source: "email",
      date: "2026-04-01",
      manual: false,
    };
    const out = migrateLegacyProperties({ budget: entry }, "2026-03-01");
    expect(out.budget).toEqual(entry);
  });

  it("preserves _history arrays as-is", () => {
    const history = [
      { value: 25000, source: "x", date: "2026-02-01", manual: false },
    ];
    const out = migrateLegacyProperties(
      { budget: 30000, budget_history: history },
      "2026-03-01",
    );
    expect(out.budget_history).toBe(history); // reference preserved
  });

  it("idempotent — re-running on already-migrated produces same result", () => {
    const once = migrateLegacyProperties(
      { budget: 30000 },
      "2026-03-01",
    );
    const twice = migrateLegacyProperties(once, "2026-03-01");
    expect(twice).toEqual(once);
  });

  it("returns empty object for null/undefined input", () => {
    expect(migrateLegacyProperties(null, "2026-03-01")).toEqual({});
    expect(migrateLegacyProperties(undefined, "2026-03-01")).toEqual({});
  });
});
