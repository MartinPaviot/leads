import { describe, it, expect } from "vitest";
import type { FilterCondition } from "@/lib/search/filters";
import {
  scopeSmartFilters,
  isCoveredByFullTextSearch,
  ACCOUNT_FILTER_FIELDS,
  CONTACT_FILTER_FIELDS,
} from "@/lib/search/smart-filter-scope";

const f = (
  field: string,
  operator: FilterCondition["operator"],
  value: FilterCondition["value"],
): FilterCondition => ({ field, operator, value });

// Regression for the "41 accounts match police / No accounts match police"
// contradiction: the broad search box matches "police" semantically on
// industry (-> Law Enforcement), so a literal client-side `industry contains
// "police"` smart filter must never be applied — it would drop exactly those
// rows and disagree with the count banner.
describe("scopeSmartFilters — the broad search owns all text matching", () => {
  it("drops a keyword pigeonholed into industry (the 'police' bug)", () => {
    const { kept, deferredToSearch } = scopeSmartFilters(
      [f("industry", "contains", "police")],
      "account",
    );
    expect(kept).toEqual([]);
    expect(deferredToSearch).toHaveLength(1);
  });

  it("drops positive text matches on every account text field", () => {
    const filters = [
      f("name", "contains", "acme"),
      f("domain", "contains", "acme.com"),
      f("industry", "eq", "police"),
      f("industry", "includes-any", ["police", "fire"]),
      f("size", "contains", "50"),
      f("revenue", "contains", "1M"),
    ];
    expect(scopeSmartFilters(filters, "account").kept).toEqual([]);
  });

  it("keeps a numeric fit-score threshold (broad search can't express it)", () => {
    const filters = [f("industry", "contains", "saas"), f("score", "gte", 70)];
    expect(scopeSmartFilters(filters, "account").kept).toEqual([f("score", "gte", 70)]);
  });

  it("keeps numeric eq on score (numeric eq is not a text match)", () => {
    expect(scopeSmartFilters([f("score", "eq", 80)], "account").kept).toEqual([
      f("score", "eq", 80),
    ]);
  });

  it("keeps explicit exclusions / negations", () => {
    const filters = [
      f("industry", "not-contains", "agency"),
      f("name", "not-contains", "test"),
    ];
    expect(scopeSmartFilters(filters, "account").kept).toEqual(filters);
  });

  it("drops contact keyword text matches incl. title and companyName", () => {
    const filters = [
      f("title", "contains", "police"),
      f("companyName", "contains", "acme"),
      f("firstName", "contains", "john"),
      f("email", "contains", "@acme"),
    ];
    expect(scopeSmartFilters(filters, "contact").kept).toEqual([]);
  });

  it("is a no-op on an empty filter set", () => {
    expect(scopeSmartFilters([], "account")).toEqual({ kept: [], deferredToSearch: [] });
  });
});

describe("isCoveredByFullTextSearch", () => {
  it("treats a positive text op on a text field as covered", () => {
    expect(isCoveredByFullTextSearch(f("industry", "contains", "x"), ACCOUNT_FILTER_FIELDS)).toBe(true);
  });
  it("does not treat numeric ops as covered", () => {
    expect(isCoveredByFullTextSearch(f("score", "gte", 70), ACCOUNT_FILTER_FIELDS)).toBe(false);
  });
  it("does not treat negations as covered", () => {
    expect(isCoveredByFullTextSearch(f("industry", "not-contains", "x"), ACCOUNT_FILTER_FIELDS)).toBe(false);
  });
  it("ignores unknown fields", () => {
    expect(isCoveredByFullTextSearch(f("bogus", "contains", "x"), CONTACT_FILTER_FIELDS)).toBe(false);
  });

  it("treats contact company name as broad-search territory (the contacts API searches it server-side)", () => {
    // Contract lock: /api/contacts ?search= matches the query against the
    // company NAME (added alongside the existing company-industry match), so a
    // companyName smart filter is redundant and must be deferred to the search
    // box. If the companyName clause is ever dropped from the route, the broad
    // search and this contract diverge — keep them in sync.
    expect(CONTACT_FILTER_FIELDS.some((field) => field.key === "companyName")).toBe(true);
    expect(isCoveredByFullTextSearch(f("companyName", "contains", "acme"), CONTACT_FILTER_FIELDS)).toBe(true);
  });
});
