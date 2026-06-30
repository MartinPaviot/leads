import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveLinkedInParameter = vi.fn();
vi.mock("@/lib/providers/unipile/http", () => ({
  resolveLinkedInParameter: (...a: unknown[]) => resolveLinkedInParameter(...a),
}));

import {
  buildJobsSearchBody,
  jobsBodyUsable,
  resolveJobsQuery,
  buildPostsSearchBody,
  postsBodyUsable,
  type JobsResolvedFilter,
} from "../jobs-posts";

const CFG = { dsn: "https://x.unipile.com:1", apiKey: "k" } as never;
const rf = (field: string, label: string, id: string | null): JobsResolvedFilter => ({ field, label, id, matched: id ? label : null });

describe("buildJobsSearchBody (pure)", () => {
  it("maps resolved ids to location/industry/function/role/company + validates enums", () => {
    const body = buildJobsSearchBody(
      {
        keywords: "revops",
        sortBy: "date",
        datePostedDays: 30,
        withinAreaMiles: 25,
        seniorities: ["executive", "Director", "wizard"],
        jobTypes: ["full_time", "nope"],
        presence: ["remote", "hybrid", "teleport"],
        easyApply: true,
        under10Applicants: true,
        inYourNetwork: true,
      },
      [
        rf("locations", "France", "105015875"),
        rf("industries", "software", "4"),
        rf("functions", "Sales", "sale"),
        rf("roles", "Head of Sales", "592"),
        rf("companies", "Stripe", "2135371"),
      ],
    );
    expect(body).toEqual({
      api: "classic",
      category: "jobs",
      keywords: "revops",
      sort_by: "date",
      date_posted: 30,
      location: ["105015875"],
      location_within_area: 25,
      industry: ["4"],
      function: ["sale"],
      role: ["592"],
      company: ["2135371"],
      seniority: ["executive", "director"], // wizard dropped, Director lowercased
      job_type: ["full_time"], // nope dropped
      presence: ["remote", "hybrid"], // teleport dropped
      easy_apply: true,
      under_10_applicants: true,
      in_your_network: true,
    });
  });

  it("drops unresolved ids and omits within_area without a location", () => {
    const body = buildJobsSearchBody({ withinAreaMiles: 25 }, [rf("roles", "Wizard", null)]);
    expect(body).toEqual({ api: "classic", category: "jobs" });
  });

  it("jobsBodyUsable ignores sort_by-only bodies", () => {
    expect(jobsBodyUsable({ api: "classic", category: "jobs" })).toBe(false);
    expect(jobsBodyUsable({ api: "classic", category: "jobs", sort_by: "date" })).toBe(false);
    expect(jobsBodyUsable({ api: "classic", category: "jobs", keywords: "x" })).toBe(true);
    expect(jobsBodyUsable({ api: "classic", category: "jobs", role: ["592"] })).toBe(true);
  });
});

describe("resolveJobsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLinkedInParameter.mockImplementation(async (_c: unknown, _a: unknown, type: string, kw: string) => {
      const map: Record<string, Array<{ id: string; title: string }>> = {
        "LOCATION:france": [{ id: "105015875", title: "France" }],
        "JOB_TITLE:head of sales": [{ id: "592", title: "Head of Sales" }],
        "JOB_FUNCTION:sales": [{ id: "sale", title: "Sales" }],
        "INDUSTRY:software": [{ id: "4", title: "Software Development" }],
        "COMPANY:stripe": [{ id: "2135371", title: "Stripe" }],
      };
      return map[`${type}:${(kw || "").toLowerCase()}`] ?? [];
    });
  });

  it("resolves via the CLASSIC service and reports matches + misses", async () => {
    const out = await resolveJobsQuery(CFG, "acc-1", {
      locations: ["France"],
      roles: ["Head of Sales", "Wizard"],
      functions: ["Sales"],
      companies: ["Stripe"],
    });
    expect(out.usable).toBe(true);
    expect(out.body).toMatchObject({
      api: "classic",
      category: "jobs",
      location: ["105015875"],
      role: ["592"],
      function: ["sale"],
      company: ["2135371"],
    });
    expect(out.report).toContainEqual({ field: "roles", label: "Wizard", id: null, matched: null });
    // resolved in the CLASSIC service (5th arg)
    expect(resolveLinkedInParameter.mock.calls[0][4]).toBe("CLASSIC");
  });

  it("usable=false when nothing resolves and no keywords", async () => {
    const out = await resolveJobsQuery(CFG, "acc-1", { roles: ["Nonexistent"] });
    expect(out.usable).toBe(false);
  });
});

describe("buildPostsSearchBody (pure)", () => {
  it("validates date_posted + content_type enums", () => {
    expect(buildPostsSearchBody({ keywords: "sales automation", sortBy: "date", datePosted: "past_week", contentType: "videos" })).toEqual({
      api: "classic",
      category: "posts",
      keywords: "sales automation",
      sort_by: "date",
      date_posted: "past_week",
      content_type: "videos",
    });
  });

  it("drops invalid enum values", () => {
    const b = buildPostsSearchBody({ keywords: "x", datePosted: "past_year", contentType: "holograms" });
    expect(b.date_posted).toBeUndefined();
    expect(b.content_type).toBeUndefined();
  });

  it("postsBodyUsable requires keywords", () => {
    expect(postsBodyUsable({ api: "classic", category: "posts" })).toBe(false);
    expect(postsBodyUsable({ api: "classic", category: "posts", keywords: "x" })).toBe(true);
  });
});
