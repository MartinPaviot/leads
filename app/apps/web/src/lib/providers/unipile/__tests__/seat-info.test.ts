import { describe, it, expect } from "vitest";
import { seatInfoFromAccount, type UnipileAccountInfo } from "../http";

// The verified live GET /accounts/{id} shape (martin's connected Sales-Nav seat).
const liveSalesNav: UnipileAccountInfo = {
  object: "Account",
  id: "0vB-DJ46TbOqW80oiA9Z2Q",
  type: "LINKEDIN",
  name: "Martin Paviot",
  connection_params: {
    im: {
      username: "Martin Paviot",
      publicIdentifier: "martin-paviot",
      premiumFeatures: ["sales_navigator"],
    },
  },
  sources: [{ status: "OK" }],
};

describe("seatInfoFromAccount", () => {
  it("maps the live Sales-Navigator seat (premiumFeatures -> seat_type, name, profile_url)", () => {
    expect(seatInfoFromAccount(liveSalesNav)).toEqual({
      seatType: "sales_navigator",
      displayName: "Martin Paviot",
      profileUrl: "https://www.linkedin.com/in/martin-paviot",
    });
  });

  it("detects recruiter", () => {
    expect(seatInfoFromAccount({ id: "x", connection_params: { im: { premiumFeatures: ["recruiter"] } } }).seatType).toBe("recruiter");
  });

  it("prefers sales_navigator when both premium features are present", () => {
    expect(
      seatInfoFromAccount({ id: "x", connection_params: { im: { premiumFeatures: ["recruiter", "sales_navigator"] } } }).seatType,
    ).toBe("sales_navigator");
  });

  it("is case-insensitive on the feature name", () => {
    expect(seatInfoFromAccount({ id: "x", connection_params: { im: { premiumFeatures: ["Sales_Navigator"] } } }).seatType).toBe("sales_navigator");
  });

  it("falls back to classic with no premium features", () => {
    expect(seatInfoFromAccount({ id: "x", name: "Jane", connection_params: { im: { premiumFeatures: [] } } })).toEqual({
      seatType: "classic",
      displayName: "Jane",
      profileUrl: null,
    });
  });

  it("classic when connection_params is absent; display name + url null", () => {
    expect(seatInfoFromAccount({ id: "x" })).toEqual({ seatType: "classic", displayName: null, profileUrl: null });
  });

  it("falls back to im.username when top-level name is absent", () => {
    expect(seatInfoFromAccount({ id: "x", connection_params: { im: { username: "Bob B" } } }).displayName).toBe("Bob B");
  });
});
