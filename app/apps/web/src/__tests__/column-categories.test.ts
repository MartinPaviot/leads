import { describe, it, expect } from "vitest";
import {
  COLUMN_CATEGORIES,
  DEFAULT_VISIBLE_CATEGORY_KEYS,
  getColumnCategory,
  enrichCriteriaForCategories,
  isCategoryAvailable,
  buildPickerModel,
} from "@/lib/accounts/column-categories";

describe("column categories catalog", () => {
  it("covers the firmographic extras and the built-in signals", () => {
    const extras = COLUMN_CATEGORIES.filter((c) => c.group === "firmographic").map((c) => c.key);
    const signals = COLUMN_CATEGORIES.filter((c) => c.group === "signal").map((c) => c.key);
    expect(extras.sort()).toEqual(
      ["extra:foundedYear", "extra:funding", "extra:keywords", "extra:technologies"].sort(),
    );
    expect(signals.sort()).toEqual(
      [
        "signal:funding_crunchbase",
        "signal:funding_recent",
        "signal:hiring_intent",
        "signal:investor_overlap",
        "signal:yc_company",
      ].sort(),
    );
  });

  it("keeps every category key unique and resolvable", () => {
    const keys = COLUMN_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(getColumnCategory(key)?.key).toBe(key);
    expect(getColumnCategory("nope")).toBeUndefined();
  });

  it("declares a fetch method (source + kind) for every category", () => {
    for (const c of COLUMN_CATEGORIES) {
      expect(c.source.length).toBeGreaterThan(0);
      expect(["enrich", "signal"]).toContain(c.kind);
      expect(c.refKey.length).toBeGreaterThan(0);
    }
  });

  it("defaults built-ins to hidden (lean table)", () => {
    expect(DEFAULT_VISIBLE_CATEGORY_KEYS).toEqual([]);
  });

  it("maps visible firmographic categories back to enrichment criteria only", () => {
    const got = enrichCriteriaForCategories([
      "extra:funding",
      "extra:technologies",
      "signal:yc_company", // not an enrich category -> excluded
      "field:custom-1", // unknown -> excluded
    ]);
    expect(got.sort()).toEqual(["funding", "technologies"].sort());
  });

  it("greys out the unconnected Crunchbase signal, keeps everything else available", () => {
    for (const c of COLUMN_CATEGORIES) {
      const expected = c.key !== "signal:funding_crunchbase";
      expect(c.available, `${c.key} availability`).toBe(expected);
    }
    expect(isCategoryAvailable("signal:funding_crunchbase")).toBe(false);
    expect(isCategoryAvailable("signal:funding_recent")).toBe(true);
    // Unknown (dynamic) keys are available — their column is already shown.
    expect(isCategoryAvailable("custom-signal:anything")).toBe(true);
  });

  it("never names a data provider in a user-facing source line", () => {
    const provider = /\b(apollo|crunchbase|lusha|sirene|zeliq|pappers|datagma)\b/i;
    for (const c of COLUMN_CATEGORIES) {
      expect(c.source, `${c.key} leaks a provider: "${c.source}"`).not.toMatch(provider);
    }
  });

  it("buildPickerModel threads availability: Crunchbase greyed, dynamics live", () => {
    const { categories } = buildPickerModel({
      visible: new Set<string>(),
      hidden: new Set<string>(),
      dynamic: {
        customSignals: [{ id: "s1", name: "Press mention" }],
        signalTypes: ["news_event"],
        customFields: [{ id: "f1", name: "Account note" }],
      },
    });
    const byKey = new Map(categories.map((c) => [c.key, c]));
    expect(byKey.get("signal:funding_crunchbase")?.available).toBe(false);
    expect(byKey.get("signal:funding_recent")?.available).toBe(true);
    // Dynamic columns are always selectable (availability omitted/true).
    expect(byKey.get("custom-signal:s1")?.available).not.toBe(false);
    expect(byKey.get("signal-type:news_event")?.available).not.toBe(false);
    expect(byKey.get("custom-field:f1")?.available).not.toBe(false);
  });
});
