import { describe, it, expect } from "vitest";
import { countryFromTimezone, speakableGeo } from "@/lib/call-mode/geo";

describe("countryFromTimezone", () => {
  it("maps known European timezones to French country labels", () => {
    expect(countryFromTimezone("Europe/Zurich")).toBe("Suisse");
    expect(countryFromTimezone("Europe/Paris")).toBe("France");
    expect(countryFromTimezone("Europe/Brussels")).toBe("Belgique");
  });

  it("falls back to the timezone's own city segment when unmapped", () => {
    expect(countryFromTimezone("America/New_York")).toBe("New York");
  });

  it("returns null when the timezone is missing or has no city segment", () => {
    expect(countryFromTimezone(null)).toBeNull();
    expect(countryFromTimezone(undefined)).toBeNull();
    expect(countryFromTimezone("")).toBeNull();
    expect(countryFromTimezone("UTC")).toBeNull();
  });
});

describe("speakableGeo", () => {
  it("speaks the most precise segment of the enrichment location (the city)", () => {
    expect(speakableGeo("Lausanne, Vaud, Suisse", "Europe/Zurich")).toBe("Lausanne");
    expect(speakableGeo("Genève, Suisse", null)).toBe("Genève");
  });

  it("keeps a single-segment location as-is (canton- or country-only enrichment)", () => {
    expect(speakableGeo("Suisse", "Europe/Paris")).toBe("Suisse");
  });

  it("falls back to the timezone country when the location is absent or blank", () => {
    expect(speakableGeo(null, "Europe/Zurich")).toBe("Suisse");
    expect(speakableGeo(undefined, "Europe/Paris")).toBe("France");
    expect(speakableGeo("", "Europe/Paris")).toBe("France");
    expect(speakableGeo("   ", "Europe/Zurich")).toBe("Suisse");
  });

  it("returns null when nothing is known — never invents a place", () => {
    expect(speakableGeo(null, null)).toBeNull();
    expect(speakableGeo("", undefined)).toBeNull();
  });
});
