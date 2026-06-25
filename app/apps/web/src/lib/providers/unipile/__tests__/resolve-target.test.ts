import { describe, it, expect } from "vitest";
import {
  publicIdentifierFromUrl,
  degreeFromProfile,
  parseUserProfile,
} from "../resolve-target";

describe("publicIdentifierFromUrl", () => {
  it("extracts the /in/ handle across scheme / www / trailing slash / query", () => {
    expect(publicIdentifierFromUrl("https://www.linkedin.com/in/jane-doe/")).toBe("jane-doe");
    expect(publicIdentifierFromUrl("linkedin.com/in/jane-doe")).toBe("jane-doe");
    expect(publicIdentifierFromUrl("https://linkedin.com/in/Jane-Doe?utm=x")).toBe("jane-doe");
    expect(publicIdentifierFromUrl("https://fr.linkedin.com/in/jean-dupont#contact")).toBe("jean-dupont");
  });

  it("returns null when there is no /in/ segment or no url", () => {
    expect(publicIdentifierFromUrl("https://linkedin.com/company/acme")).toBeNull();
    expect(publicIdentifierFromUrl(null)).toBeNull();
    expect(publicIdentifierFromUrl("")).toBeNull();
  });
});

describe("degreeFromProfile", () => {
  it("maps network_distance variants", () => {
    expect(degreeFromProfile({ network_distance: "DISTANCE_1" })).toBe("1st");
    expect(degreeFromProfile({ network_distance: "DISTANCE_2" })).toBe("2nd");
    expect(degreeFromProfile({ network_distance: "DISTANCE_3" })).toBe("3rd");
    expect(degreeFromProfile({ network_distance: "FIRST_DEGREE" })).toBe("1st");
  });
  it("treats is_relationship as 1st-degree", () => {
    expect(degreeFromProfile({ is_relationship: true })).toBe("1st");
  });
  it("returns null for out-of-network / unknown", () => {
    expect(degreeFromProfile({ network_distance: "OUT_OF_NETWORK" })).toBeNull();
    expect(degreeFromProfile({})).toBeNull();
  });
});

describe("parseUserProfile", () => {
  it("prefers provider_id, falls back to id, trims, and carries degree", () => {
    expect(parseUserProfile({ provider_id: " ACoAA1 ", network_distance: "DISTANCE_1" })).toEqual({ providerId: "ACoAA1", degree: "1st" });
    expect(parseUserProfile({ id: "ACoAA2", is_relationship: true })).toEqual({ providerId: "ACoAA2", degree: "1st" });
  });
  it("returns null providerId when neither field is present", () => {
    expect(parseUserProfile({ network_distance: "DISTANCE_2" })).toEqual({ providerId: null, degree: "2nd" });
  });
});
