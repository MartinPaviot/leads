import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeApifyItem,
  isApifyConfigured,
  fetchLinkedInProfileByUrl,
} from "@/lib/linkedin/apify-profile";
import {
  compareRole,
  companiesMatch,
  normalizeCompany,
} from "@/lib/linkedin/verify-role";

// A representative dev_fusion/linkedin-profile-scraper output row.
const FABIEN_ITEM = {
  firstName: "Fabien",
  lastName: "Courvoisier",
  headline: "Directeur général Afiro",
  linkedinUrl: "https://www.linkedin.com/in/fabien-courvoisier-872a7a33/",
  experiences: [
    { title: "Directeur Général", companyName: "Afiro", jobStillWorking: true, jobStartedOn: "2023-01", jobEndedOn: null },
    { title: "Responsable", companyName: "Afiro", jobStillWorking: false, jobStartedOn: "2013-01", jobEndedOn: "2023-01" },
  ],
};

describe("normalizeApifyItem", () => {
  it("maps the dev_fusion shape to positions with a current flag", () => {
    const p = normalizeApifyItem(FABIEN_ITEM);
    expect(p.fullName).toBe("Fabien Courvoisier");
    expect(p.profileUrl).toContain("linkedin.com/in/");
    expect(p.positions).toHaveLength(2);
    expect(p.positions[0]).toMatchObject({ title: "Directeur Général", company: "Afiro", isCurrent: true });
    expect(p.positions[1].isCurrent).toBe(false);
  });

  it("treats a missing end date as current and is defensive about junk", () => {
    const p = normalizeApifyItem({ experience: [{ title: "CEO", company: "NewCo", jobStartedOn: "2026-02" }] });
    expect(p.positions[0]).toMatchObject({ title: "CEO", company: "NewCo", isCurrent: true });
    expect(normalizeApifyItem(null).positions).toEqual([]);
    expect(normalizeApifyItem({}).fullName).toBeNull();
  });
});

describe("normalizeCompany / companiesMatch", () => {
  it("strips legal forms and matches fuzzily", () => {
    expect(normalizeCompany("Afiro SA")).toBe("afiro");
    expect(companiesMatch("Afiro", "AFIRO")).toBe(true);
    expect(companiesMatch("Afiro", "Afiro Association")).toBe(true);
    expect(companiesMatch("Bricks", "Bricks Portugal")).toBe(true);
    expect(companiesMatch("Afiro", "Afira")).toBe(false);
    expect(companiesMatch("Afiro", "")).toBe(false);
    expect(companiesMatch(null, "Afiro")).toBe(false);
  });
});

describe("compareRole", () => {
  it("confirms when a current position matches the stored company", () => {
    const r = compareRole({ storedCompany: "Afiro" }, normalizeApifyItem(FABIEN_ITEM));
    expect(r.status).toBe("confirmed");
    if (r.status === "confirmed") expect(r.company).toBe("Afiro");
  });

  it("flags 'left' when the current role is elsewhere", () => {
    const moved = normalizeApifyItem({
      experiences: [
        { title: "Directeur", companyName: "Nouvelle Entreprise", jobStillWorking: true, jobEndedOn: null },
        { title: "Directeur Général", companyName: "Afiro", jobStillWorking: false, jobEndedOn: "2026-02" },
      ],
    });
    const r = compareRole({ storedCompany: "Afiro" }, moved);
    expect(r.status).toBe("left");
    if (r.status === "left") expect(r.company).toBe("Nouvelle Entreprise");
  });

  it("returns unknown with no stored company or no current position (fail-closed)", () => {
    expect(compareRole({ storedCompany: "" }, normalizeApifyItem(FABIEN_ITEM)).status).toBe("unknown");
    const noCurrent = normalizeApifyItem({ experiences: [{ title: "X", companyName: "Y", jobStillWorking: false, jobEndedOn: "2020-01" }] });
    expect(compareRole({ storedCompany: "Afiro" }, noCurrent).status).toBe("unknown");
  });
});

describe("apify gating", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is a no-op without a token", async () => {
    vi.stubEnv("APIFY_TOKEN", "");
    expect(isApifyConfigured()).toBe(false);
    // Must not hit the network when unconfigured.
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await fetchLinkedInProfileByUrl("https://www.linkedin.com/in/x")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("sees the token when set", () => {
    vi.stubEnv("APIFY_TOKEN", "apify_xxx");
    expect(isApifyConfigured()).toBe(true);
  });
});
