import { describe, it, expect } from "vitest";
import {
  buildPickerModel,
  isDynamicCategoryKey,
  customSignalKey,
  signalTypeKey,
  customFieldKey,
  COLUMN_CATEGORIES,
} from "@/lib/accounts/column-categories";

// The accounts "Categories" picker folds two visibility models into one
// panel: built-in extras/signals are opt-IN (off until added), while the
// always-on dynamic columns (custom signals, detected signal types, custom
// fields) are opt-OUT (shown until hidden). The user's report — a column
// already on the page must show *checked* so it can be unchecked — is the
// opt-out half. These cover both.

const dynamic = {
  customSignals: [{ id: "sig1", name: "Champion replied" }],
  signalTypes: ["funding_round"],
  customFields: [{ id: "f1", name: "Account tier" }],
};

describe("buildPickerModel", () => {
  it("lists every built-in plus every always-on dynamic column", () => {
    const { categories } = buildPickerModel({ visible: new Set(), hidden: new Set(), dynamic });
    const keys = categories.map((c) => c.key);
    for (const c of COLUMN_CATEGORIES) expect(keys).toContain(c.key);
    expect(keys).toContain(customSignalKey("sig1"));
    expect(keys).toContain(signalTypeKey("funding_round"));
    expect(keys).toContain(customFieldKey("f1"));
  });

  it("checks dynamic columns by default (opt-out); leaves built-ins unchecked (opt-in)", () => {
    const { visible } = buildPickerModel({ visible: new Set(), hidden: new Set(), dynamic });
    // The bug being fixed: columns already on the page render checked.
    expect(visible.has(customSignalKey("sig1"))).toBe(true);
    expect(visible.has(signalTypeKey("funding_round"))).toBe(true);
    expect(visible.has(customFieldKey("f1"))).toBe(true);
    // Built-ins stay off until explicitly added.
    expect(visible.has(COLUMN_CATEGORIES[0].key)).toBe(false);
  });

  it("drops a hidden dynamic key from the visible set (uncheck = hide), leaving siblings shown", () => {
    const hidden = new Set([customFieldKey("f1")]);
    const { visible } = buildPickerModel({ visible: new Set(), hidden, dynamic });
    expect(visible.has(customFieldKey("f1"))).toBe(false);
    expect(visible.has(customSignalKey("sig1"))).toBe(true);
  });

  it("keeps an added built-in checked alongside the opt-out set", () => {
    const builtin = COLUMN_CATEGORIES[0].key;
    const { visible } = buildPickerModel({ visible: new Set([builtin]), hidden: new Set(), dynamic });
    expect(visible.has(builtin)).toBe(true);
  });

  it("groups custom fields under 'custom' and both signal kinds under 'signal'", () => {
    const { categories } = buildPickerModel({ visible: new Set(), hidden: new Set(), dynamic });
    const byKey = new Map(categories.map((c) => [c.key, c]));
    expect(byKey.get(customFieldKey("f1"))?.group).toBe("custom");
    expect(byKey.get(customSignalKey("sig1"))?.group).toBe("signal");
    expect(byKey.get(signalTypeKey("funding_round"))?.group).toBe("signal");
  });

  it("propagates the built-in availability flag through to the picker shape", () => {
    const { categories } = buildPickerModel({ visible: new Set(), hidden: new Set(), dynamic });
    const byKey = new Map(categories.map((c) => [c.key, c]));
    // Vacuous if every built-in is connected — resilient to catalog changes.
    for (const c of COLUMN_CATEGORIES.filter((c) => c.available === false)) {
      expect(byKey.get(c.key)?.available).toBe(false);
    }
    // Dynamic columns never carry an unavailable flag.
    expect(byKey.get(customSignalKey("sig1"))?.available).not.toBe(false);
  });

  it("does not name a data provider in the dynamic-column source lines", () => {
    const provider = /\b(apollo|crunchbase|lusha|sirene|zeliq|pappers|datagma)\b/i;
    const { categories } = buildPickerModel({ visible: new Set(), hidden: new Set(), dynamic });
    for (const c of categories) {
      expect(c.source, `${c.key} leaks a provider: "${c.source}"`).not.toMatch(provider);
    }
  });
});

describe("isDynamicCategoryKey", () => {
  it("is true for opt-out dynamic keys and false for built-ins", () => {
    expect(isDynamicCategoryKey(customSignalKey("x"))).toBe(true);
    expect(isDynamicCategoryKey(signalTypeKey("x"))).toBe(true);
    expect(isDynamicCategoryKey(customFieldKey("x"))).toBe(true);
    expect(isDynamicCategoryKey(COLUMN_CATEGORIES[0].key)).toBe(false);
  });
});
