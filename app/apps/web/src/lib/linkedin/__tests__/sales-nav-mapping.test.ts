import { describe, it, expect } from "vitest";
import {
  currentPosition,
  searchDegree,
  salesNavToContact,
  salesNavToAccount,
  linkedinCustomFieldValues,
  isLinkedInCategory,
  LINKEDIN_FIELD_CATALOG,
} from "../sales-nav-mapping";
import { providerRank, pickWinner } from "@/db/canonical/precedence";
import type { LinkedInSearchResult } from "@/lib/providers/unipile/http";

const result = (over: Partial<LinkedInSearchResult> = {}): LinkedInSearchResult => ({
  first_name: "Jane",
  last_name: "Doe",
  headline: "Founder @ Acme",
  location: "Paris, France",
  industry: "Software",
  network_distance: "DISTANCE_2",
  premium: true,
  shared_connections_count: 12,
  recent_posts_count: 3,
  public_profile_url: "https://www.LinkedIn.com/in/Jane-Doe/",
  current_positions: [{ company: "Acme", title: "CEO" }],
  ...over,
});

describe("Sales-Nav → canonical mappers", () => {
  it("currentPosition extracts company/title defensively", () => {
    expect(currentPosition(result())).toEqual({ company: "Acme", title: "CEO" });
    expect(currentPosition(result({ current_positions: [{ company_name: "Beta", role: "VP" }] }))).toEqual({ company: "Beta", title: "VP" });
    expect(currentPosition(result({ current_positions: [] }))).toEqual({ company: null, title: null });
  });

  it("searchDegree maps network_distance", () => {
    expect(searchDegree("DISTANCE_1")).toBe("1st");
    expect(searchDegree("DISTANCE_2")).toBe("2nd");
    expect(searchDegree("OUT_OF_NETWORK")).toBeNull();
  });

  it("salesNavToContact normalizes linkedin_url (the shared dedup key) + prefers position title", () => {
    expect(salesNavToContact(result())).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      title: "CEO",
      linkedinUrl: "linkedin.com/in/jane-doe",
    });
    // falls back to headline when no position title
    expect(salesNavToContact(result({ current_positions: [{ company: "Acme" }] })).title).toBe("Founder @ Acme");
  });

  it("salesNavToAccount uses the employer company", () => {
    expect(salesNavToAccount(result())).toEqual({ name: "Acme" });
  });
});

describe("configurable LinkedIn categories", () => {
  it("extracts only the ENABLED keys, skipping nulls", () => {
    const v = linkedinCustomFieldValues(result(), ["linkedin_headline", "linkedin_connection_degree", "linkedin_mutual_connections", "linkedin_premium"]);
    expect(v).toEqual({
      linkedin_headline: "Founder @ Acme",
      linkedin_connection_degree: "2nd",
      linkedin_mutual_connections: 12,
      linkedin_premium: "yes",
    });
  });

  it("ignores unknown keys and omits missing values", () => {
    const v = linkedinCustomFieldValues(result({ location: undefined, shared_connections_count: undefined }), ["linkedin_location", "linkedin_mutual_connections", "not_a_linkedin_field"]);
    expect(v).toEqual({});
  });

  it("isLinkedInCategory recognizes catalog keys", () => {
    expect(isLinkedInCategory("linkedin_headline")).toBe(true);
    expect(isLinkedInCategory("favorite_color")).toBe(false);
    expect(LINKEDIN_FIELD_CATALOG.length).toBeGreaterThanOrEqual(8);
  });
});

describe("provider precedence — cohabitation fix (#2)", () => {
  it("LinkedIn ranks above Apollo for its own fields; heyreach below", () => {
    expect(providerRank("unipile")).toBeGreaterThan(providerRank("apollo"));
    expect(providerRank("linkedin")).toBeGreaterThan(providerRank("apollo"));
    expect(providerRank("heyreach")).toBeLessThan(providerRank("apollo"));
    expect(providerRank("manual")).toBeGreaterThan(providerRank("unipile")); // user still wins
  });

  it("on a title conflict, the Unipile value wins over Apollo", () => {
    const winner = pickWinner([
      { provider: "apollo", value: "Head of Sales", observedAt: "2026-06-01T00:00:00Z" },
      { provider: "unipile", value: "VP Sales", observedAt: "2026-05-01T00:00:00Z" },
    ]);
    expect(winner?.value).toBe("VP Sales");
  });
});
