import { describe, it, expect } from "vitest";
import { deriveAccountTabCounts } from "@/lib/accounts/tab-counts";

describe("deriveAccountTabCounts", () => {
  it("prefers the server working-set counts when present", () => {
    const counts = deriveAccountTabCounts(
      { total: 990, tam: 57, manual: 933 },
      [{ isTam: true }], // loaded rows ignored once the server count is known
    );
    expect(counts).toEqual({ all: 990, tam: 57, manual: 933 });
  });

  it("keeps the invariant all === tam + manual from the server", () => {
    const counts = deriveAccountTabCounts({ total: 120, tam: 40, manual: 80 }, []);
    expect(counts.all).toBe(counts.tam + counts.manual);
  });

  it("reflects the active filters: a narrowed server count drops every badge", () => {
    // Same shape as a filtered response (e.g. Industry = Health) — the All
    // badge shrinks with Prospects + Manual, not the library size.
    const counts = deriveAccountTabCounts({ total: 12, tam: 5, manual: 7 }, []);
    expect(counts).toEqual({ all: 12, tam: 5, manual: 7 });
  });

  it("approximates from loaded rows until the first response lands", () => {
    const counts = deriveAccountTabCounts(null, [
      { isTam: true },
      { isTam: true },
      { isTam: false },
    ]);
    expect(counts).toEqual({ all: 3, tam: 2, manual: 1 });
  });

  it("never returns a negative manual count in the fallback", () => {
    const counts = deriveAccountTabCounts(undefined, []);
    expect(counts).toEqual({ all: 0, tam: 0, manual: 0 });
  });
});
