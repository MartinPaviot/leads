import { describe, it, expect } from "vitest";
import { contactsListView } from "@/app/(dashboard)/contacts/_list-view";

const base = { loading: false, listError: false, loadedCount: 0, filteredCount: 0, hasActiveFilter: false };

describe("contactsListView (P1 07)", () => {
  it("shows the skeleton while loading", () => {
    expect(contactsListView({ ...base, loading: true })).toBe("loading");
  });

  it("shows a retry error on a failed first-page load (NOT the empty-tenant CTA)", () => {
    expect(contactsListView({ ...base, listError: true, loadedCount: 0, filteredCount: 0 })).toBe("error");
  });

  it("shows the fresh-tenant empty state when there are genuinely no contacts and no filter", () => {
    expect(contactsListView({ ...base, loadedCount: 0, filteredCount: 0, hasActiveFilter: false })).toBe("empty-fresh");
  });

  it("shows the filtered empty state when a filter hides everything", () => {
    expect(contactsListView({ ...base, loadedCount: 12, filteredCount: 0, hasActiveFilter: true })).toBe("empty-filtered");
  });

  it("shows the list when there are matching contacts", () => {
    expect(contactsListView({ ...base, loadedCount: 12, filteredCount: 12 })).toBe("list");
  });

  it("does not show the error once some rows are loaded (keeps showing them)", () => {
    expect(contactsListView({ ...base, listError: true, loadedCount: 5, filteredCount: 5 })).toBe("list");
  });
});
