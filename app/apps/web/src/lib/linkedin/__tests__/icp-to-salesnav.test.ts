import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveLinkedInParameter = vi.fn();
const searchLinkedIn = vi.fn();
vi.mock("@/lib/providers/unipile/http", () => ({
  resolveLinkedInParameter: (...a: unknown[]) => resolveLinkedInParameter(...a),
  searchLinkedIn: (...a: unknown[]) => searchLinkedIn(...a),
}));

import {
  buildSalesNavBody,
  serviceForApi,
  paramTypeFor,
  bodyIsUsable,
  validateStructured,
  resolveIcpToSalesNavQuery,
  previewSalesNavCount,
  type ResolvedFilter,
} from "../icp-to-salesnav";

const CFG = { dsn: "https://x.unipile.com:1", apiKey: "k" } as never;
const r = (type: ResolvedFilter["type"], label: string, id: string | null): ResolvedFilter => ({
  type,
  label,
  id,
  matched: id ? label : null,
});

describe("serviceForApi", () => {
  it("maps the search api tier to the parameter service", () => {
    expect(serviceForApi("sales_navigator")).toBe("SALES_NAVIGATOR");
    expect(serviceForApi("recruiter")).toBe("RECRUITER");
    expect(serviceForApi("classic")).toBe("CLASSIC");
  });
});

describe("paramTypeFor", () => {
  it("SN people uses SALES_INDUSTRY + REGION; FUNCTION→DEPARTMENT; COMPANY for (past)company", () => {
    expect(paramTypeFor("INDUSTRY", "sales_navigator", "people")).toBe("SALES_INDUSTRY");
    expect(paramTypeFor("LOCATION", "sales_navigator", "people")).toBe("REGION");
    expect(paramTypeFor("FUNCTION", "sales_navigator", "people")).toBe("DEPARTMENT");
    expect(paramTypeFor("COMPANY", "sales_navigator", "people")).toBe("COMPANY");
    expect(paramTypeFor("PAST_COMPANY", "sales_navigator", "people")).toBe("COMPANY");
    expect(paramTypeFor("SCHOOL", "sales_navigator", "people")).toBe("SCHOOL");
  });
  it("SN companies location uses LOCATION (HQ), not REGION", () => {
    expect(paramTypeFor("LOCATION", "sales_navigator", "companies")).toBe("LOCATION");
    expect(paramTypeFor("INDUSTRY", "sales_navigator", "companies")).toBe("SALES_INDUSTRY");
  });
  it("classic uses the plain INDUSTRY/LOCATION types", () => {
    expect(paramTypeFor("INDUSTRY", "classic", "people")).toBe("INDUSTRY");
    expect(paramTypeFor("LOCATION", "classic", "people")).toBe("LOCATION");
  });
});

describe("validateStructured (pure)", () => {
  it("keeps valid enum values, drops + reports invalid ones (case-insensitive)", () => {
    const { structured, dropped } = validateStructured({
      seniorities: ["Vice_President", "cxo", "wizard"],
      companyTypes: ["public_company", "nope"],
      recentActivities: ["funding_events", "bogus"],
    });
    expect(structured.seniorities).toEqual(["vice_president", "cxo"]);
    expect(structured.companyTypes).toEqual(["public_company"]);
    expect(structured.recentActivities).toEqual(["funding_events"]);
    expect(dropped).toEqual([
      'seniority "wizard" ignored (not a LinkedIn seniority value)',
      'company type "nope" ignored (not a LinkedIn company type value)',
      'recent activity "bogus" ignored (not a LinkedIn recent activity value)',
    ]);
  });

  it("snaps headcount + tenure range edges to the nearest allowed bucket", () => {
    const { structured } = validateStructured({
      companyHeadcount: [{ min: 60, max: 240 }],
      tenure: [{ min: 4, max: 4 }],
    });
    expect(structured.companyHeadcount).toEqual([{ min: 51, max: 200 }]);
    expect(structured.tenure).toEqual([{ min: 3, max: 5 }]);
  });

  it("validates ISO-639-1 languages and reports bad ones", () => {
    const { structured, dropped } = validateStructured({ profileLanguages: ["EN", "fr", "english"] });
    expect(structured.profileLanguages).toEqual(["en", "fr"]);
    expect(dropped).toContain('language "english" ignored (need a 2-letter ISO-639-1 code)');
  });

  it("passes through spotlight booleans + list ids + savedSearchId", () => {
    const { structured } = validateStructured({
      changedJobs: true,
      postedOnLinkedin: true,
      mentionedInNews: true,
      hasJobOffers: true,
      leadListIds: [" 7305 ", ""],
      accountListIds: ["ALL"],
      savedSearchId: " 189729 ",
    });
    expect(structured.changedJobs).toBe(true);
    expect(structured.postedOnLinkedin).toBe(true);
    expect(structured.mentionedInNews).toBe(true);
    expect(structured.hasJobOffers).toBe(true);
    expect(structured.leadListIds).toEqual(["7305"]);
    expect(structured.accountListIds).toEqual(["ALL"]);
    expect(structured.savedSearchId).toBe("189729");
  });
});

describe("buildSalesNavBody (pure)", () => {
  it("SN people: titles use the precise `role` filter (NOT keywords); {include} string ids", () => {
    const body = buildSalesNavBody(
      "sales_navigator",
      "people",
      [r("LOCATION", "France", "105015875"), r("INDUSTRY", "software", "4"), r("JOB_TITLE", "Founder", "35")],
      { keywords: "ai", networkDistance: [1, 2] },
    );
    expect(body).toEqual({
      api: "sales_navigator",
      category: "people",
      keywords: "ai",
      location: { include: ["105015875"] },
      industry: { include: ["4"] },
      role: { include: ["35"] },
      network_distance: [1, 2],
    });
  });

  it("SN people: an unresolved title falls back to plain text in `role` (the field accepts it)", () => {
    const body = buildSalesNavBody("sales_navigator", "people", [
      r("JOB_TITLE", "Chief Revenue Officer", null),
      r("JOB_TITLE", "Founder", "35"),
    ]);
    expect(body.role).toEqual({ include: ["Chief Revenue Officer", "35"] });
    expect(body.keywords).toBeUndefined();
  });

  it("SN people: company/school/function + structured filters assemble in their own fields", () => {
    const body = buildSalesNavBody(
      "sales_navigator",
      "people",
      [r("COMPANY", "Stripe", "12345"), r("SCHOOL", "Stanford", "1792"), r("FUNCTION", "Engineering", "8")],
      {
        structured: {
          seniorities: ["vice_president", "cxo"],
          companyHeadcount: [{ min: 51, max: 200 }],
          tenure: [{ min: 1, max: 5 }],
          companyTypes: ["privately_held"],
          profileLanguages: ["en"],
          changedJobs: true,
          postedOnLinkedin: true,
          leadListIds: ["7305"],
        },
      },
    );
    expect(body.company).toEqual({ include: ["12345"] });
    expect(body.school).toEqual({ include: ["1792"] });
    expect(body.function).toEqual({ include: ["8"] });
    expect(body.seniority).toEqual({ include: ["vice_president", "cxo"] });
    expect(body.company_headcount).toEqual([{ min: 51, max: 200 }]);
    expect(body.tenure).toEqual([{ min: 1, max: 5 }]);
    expect(body.company_type).toEqual(["privately_held"]);
    expect(body.profile_language).toEqual(["en"]);
    expect(body.changed_jobs).toBe(true);
    expect(body.posted_on_linkedin).toBe(true);
    expect(body.lead_lists).toEqual({ include: ["7305"] });
  });

  it("SN companies: structured filters map to headcount/has_job_offers/recent_activities", () => {
    const body = buildSalesNavBody(
      "sales_navigator",
      "companies",
      [r("INDUSTRY", "software", "4"), r("LOCATION", "France", "105015875")],
      {
        structured: {
          companyHeadcount: [{ min: 51, max: 200 }],
          hasJobOffers: true,
          recentActivities: ["funding_events"],
          accountListIds: ["ALL"],
          // people-only fields must NOT leak into a companies body:
          seniorities: ["cxo"],
          changedJobs: true,
        },
      },
    );
    expect(body.industry).toEqual({ include: ["4"] });
    expect(body.location).toEqual({ include: ["105015875"] });
    expect(body.headcount).toEqual([{ min: 51, max: 200 }]);
    expect(body.has_job_offers).toBe(true);
    expect(body.recent_activities).toEqual(["funding_events"]);
    expect(body.account_lists).toEqual({ include: ["ALL"] });
    expect(body.seniority).toBeUndefined();
    expect(body.changed_jobs).toBeUndefined();
  });

  it("savedSearchId overrides every other filter", () => {
    const body = buildSalesNavBody("sales_navigator", "people", [r("INDUSTRY", "x", "4")], {
      keywords: "ignored",
      networkDistance: [1],
      structured: { savedSearchId: "189729", seniorities: ["cxo"] },
    });
    expect(body).toEqual({ api: "sales_navigator", category: "people", saved_search_id: "189729", network_distance: [1] });
  });

  it("classic people: flat string-id arrays incl. job_title (no role/structured)", () => {
    const body = buildSalesNavBody("classic", "people", [
      r("LOCATION", "X", "1"),
      r("INDUSTRY", "Y", "2"),
      r("JOB_TITLE", "Z", "3"),
    ]);
    expect(body).toEqual({ api: "classic", category: "people", location: ["1"], industry: ["2"], job_title: ["3"] });
  });

  it("only api+category when nothing resolved and no keywords", () => {
    expect(buildSalesNavBody("classic", "people", [r("INDUSTRY", "x", null)])).toEqual({ api: "classic", category: "people" });
  });
});

describe("bodyIsUsable", () => {
  it("false for api+category (+network_distance) only; true with any real filter", () => {
    expect(bodyIsUsable({ api: "sales_navigator", category: "people" })).toBe(false);
    expect(bodyIsUsable({ api: "sales_navigator", category: "people", network_distance: [1] })).toBe(false);
    expect(bodyIsUsable({ api: "sales_navigator", category: "people", changed_jobs: true })).toBe(true);
    expect(bodyIsUsable({ api: "sales_navigator", category: "people", keywords: "ai" })).toBe(true);
  });
});

describe("resolveIcpToSalesNavQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLinkedInParameter.mockImplementation(async (_cfg: unknown, _acc: unknown, type: string, kw: string) => {
      const map: Record<string, Array<{ id: string; title: string }>> = {
        "SALES_INDUSTRY:software": [{ id: "4", title: "Software Development" }],
        "REGION:france": [{ id: "105015875", title: "France" }],
        "JOB_TITLE:founder": [{ id: "35", title: "Founder" }],
        "DEPARTMENT:engineering": [{ id: "8", title: "Engineering" }],
        "COMPANY:stripe": [{ id: "12345", title: "Stripe" }],
        "SCHOOL:stanford": [{ id: "1792", title: "Stanford University" }],
      };
      return map[`${type}:${(kw || "").toLowerCase()}`] ?? [];
    });
  });

  it("resolves each label with the SN-mapped param type, builds the body, reports matches + misses", async () => {
    const out = await resolveIcpToSalesNavQuery(
      CFG,
      "acc-1",
      { industries: ["software"], locations: ["France"], jobTitles: ["Founder", "Wizard"], functions: ["Engineering"] },
      { api: "sales_navigator", category: "people" },
    );
    expect(out.usable).toBe(true);
    expect(out.body).toEqual({
      api: "sales_navigator",
      category: "people",
      location: { include: ["105015875"] },
      industry: { include: ["4"] },
      role: { include: ["35", "Wizard"] }, // Founder→id, Wizard→plain-text fallback
      function: { include: ["8"] },
    });
    expect(out.report).toEqual([
      { type: "INDUSTRY", label: "software", id: "4", matched: "Software Development" },
      { type: "LOCATION", label: "France", id: "105015875", matched: "France" },
      { type: "JOB_TITLE", label: "Founder", id: "35", matched: "Founder" },
      { type: "JOB_TITLE", label: "Wizard", id: null, matched: null },
      { type: "FUNCTION", label: "Engineering", id: "8", matched: "Engineering" },
    ]);
    // industry resolved via SALES_INDUSTRY in the SALES_NAVIGATOR service
    expect(resolveLinkedInParameter.mock.calls[0][2]).toBe("SALES_INDUSTRY");
    expect(resolveLinkedInParameter.mock.calls[0][4]).toBe("SALES_NAVIGATOR");
  });

  it("reports dropped structured values alongside the body", async () => {
    const out = await resolveIcpToSalesNavQuery(
      CFG,
      "acc-1",
      { keywords: "ai", seniorities: ["cxo", "emperor"] },
      { api: "sales_navigator", category: "people" },
    );
    expect(out.body.seniority).toEqual({ include: ["cxo"] });
    expect(out.dropped).toEqual(['seniority "emperor" ignored (not a LinkedIn seniority value)']);
  });

  it("caches repeated labels — resolves each unique (type,label) once", async () => {
    await resolveIcpToSalesNavQuery(
      CFG,
      "acc-1",
      { industries: ["software", "Software", "software"] },
      { api: "sales_navigator", category: "people" },
    );
    expect(resolveLinkedInParameter).toHaveBeenCalledTimes(1);
  });

  it("usable=false when nothing resolves and no keywords/structured", async () => {
    const out = await resolveIcpToSalesNavQuery(CFG, "acc-1", { industries: ["Nonexistent"] }, { api: "sales_navigator", category: "people" });
    expect(out.usable).toBe(false);
    expect(out.body).toEqual({ api: "sales_navigator", category: "people" });
  });

  it("usable=true on a spotlight boolean alone", async () => {
    const out = await resolveIcpToSalesNavQuery(CFG, "acc-1", { changedJobs: true }, { api: "sales_navigator", category: "people" });
    expect(out.usable).toBe(true);
    expect(out.body.changed_jobs).toBe(true);
  });
});

describe("previewSalesNavCount", () => {
  it("runs the search with limit=1 and returns paging.total_count", async () => {
    searchLinkedIn.mockResolvedValue({ items: [], cursor: null, total: 12480 });
    const n = await previewSalesNavCount(CFG, "acc-1", { api: "sales_navigator", category: "people", changed_jobs: true });
    expect(n).toBe(12480);
    expect(searchLinkedIn.mock.calls[0][3]).toEqual({ limit: 1 });
  });
});
