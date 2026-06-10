import { describe, it, expect } from "vitest";
import { pickLatestSignalPerCompany } from "@/lib/signals/latest-signal";

const NOW = "2026-06-10T08:00:00.000Z";

describe("pickLatestSignalPerCompany", () => {
  it("keeps one signal per company — the first the scanner emitted", () => {
    const m = pickLatestSignalPerCompany(
      [
        { companyId: "c1", signalType: "funding", title: "Série B levée", detectedAt: "2026-06-08" },
        { companyId: "c1", signalType: "engagement_spike", title: "Pic" },
        { companyId: "c2", signalType: "hiring", title: "Recrute un DSI" },
      ],
      NOW,
    );
    expect(m.size).toBe(2);
    expect(m.get("c1")).toEqual({ type: "funding", label: "Série B levée", observedAt: "2026-06-08" });
    expect(m.get("c2")).toEqual({ type: "hiring", label: "Recrute un DSI", observedAt: NOW });
  });

  it("drops signals without a company, title or type", () => {
    const m = pickLatestSignalPerCompany(
      [
        { companyId: null, signalType: "funding", title: "x" },
        { companyId: "c1", signalType: "", title: "x" },
        { companyId: "c2", signalType: "hiring", title: "  " },
      ],
      NOW,
    );
    expect(m.size).toBe(0);
  });

  it("stamps observedAt with now when the scanner gave no date", () => {
    const m = pickLatestSignalPerCompany([{ companyId: "c1", signalType: "hiring", title: "t" }], NOW);
    expect(m.get("c1")?.observedAt).toBe(NOW);
  });
});
