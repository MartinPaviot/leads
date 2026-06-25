import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveLinkedInParameter = vi.fn();
vi.mock("@/lib/providers/unipile/http", () => ({
  resolveLinkedInParameter: (...a: unknown[]) => resolveLinkedInParameter(...a),
}));

import {
  buildSalesNavBody,
  serviceForApi,
  resolveIcpToSalesNavQuery,
  type ResolvedFilter,
} from "../icp-to-salesnav";

const CFG = { dsn: "https://x.unipile.com:1", apiKey: "k" } as never;

describe("serviceForApi", () => {
  it("maps the search api tier to the parameter service", () => {
    expect(serviceForApi("sales_navigator")).toBe("SALES_NAVIGATOR");
    expect(serviceForApi("recruiter")).toBe("RECRUITER");
    expect(serviceForApi("classic")).toBe("CLASSIC");
  });
});

describe("buildSalesNavBody (pure)", () => {
  const r = (type: ResolvedFilter["type"], label: string, id: string | null): ResolvedFilter => ({ type, label, id, matched: id ? label : null });

  it("SN people: {include} string-id objects; titles fold into keywords (SN has no job_title)", () => {
    const body = buildSalesNavBody(
      "sales_navigator",
      "people",
      [r("LOCATION", "France", "105015875"), r("INDUSTRY", "software", "4"), r("JOB_TITLE", "Founder", "35")],
      { keywords: "ai", networkDistance: [1, 2] },
    );
    expect(body).toEqual({
      api: "sales_navigator",
      category: "people",
      keywords: "ai (Founder)",
      location: { include: ["105015875"] },
      industry: { include: ["4"] },
      network_distance: [1, 2],
    });
  });

  it("SN people: multi-word titles are quoted inside the OR group", () => {
    const body = buildSalesNavBody("sales_navigator", "people", [
      r("JOB_TITLE", "Chief Executive Officer", "8"),
      r("JOB_TITLE", "Founder", "35"),
    ]);
    expect(body.keywords).toBe('("Chief Executive Officer" OR Founder)');
  });

  it("classic people: flat string-id arrays incl. job_title", () => {
    const body = buildSalesNavBody("classic", "people", [r("LOCATION", "X", "1"), r("INDUSTRY", "Y", "2"), r("JOB_TITLE", "Z", "3")]);
    expect(body).toEqual({ api: "classic", category: "people", location: ["1"], industry: ["2"], job_title: ["3"] });
  });

  it("only api+category when nothing resolved and no keywords", () => {
    expect(buildSalesNavBody("classic", "people", [r("INDUSTRY", "x", null)])).toEqual({ api: "classic", category: "people" });
  });
});

describe("resolveIcpToSalesNavQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLinkedInParameter.mockImplementation(async (_cfg: unknown, _acc: unknown, type: string, kw: string) => {
      const map: Record<string, Array<{ id: string; title: string }>> = {
        "INDUSTRY:software": [{ id: "4", title: "Software Development" }],
        "LOCATION:france": [{ id: "105015875", title: "France" }],
        "JOB_TITLE:founder": [{ id: "35", title: "Founder" }],
      };
      return map[`${type}:${(kw || "").toLowerCase()}`] ?? [];
    });
  });

  it("resolves each label (top match), builds the body, reports matches + misses, in the search's service", async () => {
    const out = await resolveIcpToSalesNavQuery(
      CFG,
      "acc-1",
      { industries: ["software"], locations: ["France"], jobTitles: ["Founder", "Wizard"] },
      { api: "sales_navigator", category: "people" },
    );
    expect(out.usable).toBe(true);
    expect(out.body).toEqual({
      api: "sales_navigator",
      category: "people",
      location: { include: ["105015875"] },
      industry: { include: ["4"] },
      keywords: "(Founder OR Wizard)",
    });
    expect(out.report).toEqual([
      { type: "INDUSTRY", label: "software", id: "4", matched: "Software Development" },
      { type: "LOCATION", label: "France", id: "105015875", matched: "France" },
      { type: "JOB_TITLE", label: "Founder", id: "35", matched: "Founder" },
      { type: "JOB_TITLE", label: "Wizard", id: null, matched: null },
    ]);
    // resolved in SALES_NAVIGATOR (5th arg)
    expect(resolveLinkedInParameter.mock.calls[0][4]).toBe("SALES_NAVIGATOR");
  });

  it("caches repeated labels — resolves each unique (type,label) once", async () => {
    await resolveIcpToSalesNavQuery(CFG, "acc-1", { industries: ["software", "Software", "software"] }, { api: "classic", category: "people" });
    expect(resolveLinkedInParameter).toHaveBeenCalledTimes(1);
  });

  it("usable=false when nothing resolves and no keywords/titles", async () => {
    const out = await resolveIcpToSalesNavQuery(CFG, "acc-1", { industries: ["Nonexistent"] }, { api: "sales_navigator", category: "people" });
    expect(out.usable).toBe(false);
    expect(out.body).toEqual({ api: "sales_navigator", category: "people" });
  });

  it("usable=true on keywords alone", async () => {
    const out = await resolveIcpToSalesNavQuery(CFG, "acc-1", { keywords: "fintech" }, { api: "sales_navigator", category: "people" });
    expect(out.usable).toBe(true);
    expect(out.body.keywords).toBe("fintech");
  });
});
