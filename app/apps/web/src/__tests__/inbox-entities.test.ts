import { describe, it, expect } from "vitest";
import { extractEntities } from "@/lib/inbox/entities";

describe("extractEntities (INBOX-S05)", () => {
  it("extracts and dedupes emails and urls", () => {
    const e = extractEntities("ping bob@acme.ch or Bob@Acme.ch, see https://acme.ch/x and https://acme.ch/x");
    expect(e.emails).toEqual(["bob@acme.ch"]);
    expect(e.urls).toEqual(["https://acme.ch/x"]);
  });

  it("extracts money amounts across symbols and codes", () => {
    const e = extractEntities("Budget is $1,200, or €500, or CHF 2'000, or 1200 USD.");
    expect(e.amounts.length).toBeGreaterThanOrEqual(4);
    expect(e.amounts.join(" ")).toContain("$1,200");
    expect(e.amounts.join(" ")).toContain("CHF 2'000");
  });

  it("extracts ISO, numeric and textual dates", () => {
    const e = extractEntities("Let's meet 2026-06-20 or 20/06/2026 or June 20, 2026.");
    expect(e.dates).toContain("2026-06-20");
    expect(e.dates.some((d) => d.includes("June"))).toBe(true);
  });

  it("extracts a phone number but never confuses an ISO date for one", () => {
    const e = extractEntities("Call +41 22 123 45 67 before 2026-06-20.");
    expect(e.phones.some((p) => p.replace(/\D/g, "").length >= 9)).toBe(true);
    expect(e.phones).not.toContain("2026-06-20");
  });

  it("returns empty arrays for empty input", () => {
    expect(extractEntities("")).toEqual({ emails: [], urls: [], amounts: [], dates: [], phones: [] });
  });
});
