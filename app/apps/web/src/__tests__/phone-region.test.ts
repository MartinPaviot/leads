import { describe, it, expect } from "vitest";
import {
  phoneRegionKey,
  phoneRegionLabel,
  phoneRegionKeySql,
  PHONE_COUNTRIES,
  PHONE_REGION_NONE,
  PHONE_REGION_UNKNOWN,
} from "@/lib/contacts/phone-region";

describe("phoneRegionKey", () => {
  it("buckets a missing / too-short number as 'none'", () => {
    expect(phoneRegionKey(null)).toBe(PHONE_REGION_NONE);
    expect(phoneRegionKey(undefined)).toBe(PHONE_REGION_NONE);
    expect(phoneRegionKey("")).toBe(PHONE_REGION_NONE);
    expect(phoneRegionKey("  ")).toBe(PHONE_REGION_NONE);
    expect(phoneRegionKey("12 34")).toBe(PHONE_REGION_NONE); // <8 digits
  });

  it("maps E.164 Swiss / French numbers to their dial code", () => {
    expect(phoneRegionKey("+41 79 123 45 67")).toBe("41");
    expect(phoneRegionKey("+41791234567")).toBe("41");
    expect(phoneRegionKey("0041 79 123 45 67")).toBe("41"); // 00 prefix
    expect(phoneRegionKey("+33 6 12 34 56 78")).toBe("33");
    expect(phoneRegionKey("+33612345678")).toBe("33");
  });

  it("does longest-prefix matching so 3-digit codes beat their neighbours", () => {
    expect(phoneRegionKey("+352 661 234 567")).toBe("352"); // Luxembourg, not 35/3
    expect(phoneRegionKey("+423 791 234 56")).toBe("423"); // Liechtenstein, not 41
    expect(phoneRegionKey("+212 612 345 678")).toBe("212"); // Maroc
    expect(phoneRegionKey("+1 415 555 0100")).toBe("1"); // NANP, single-digit code
  });

  it("never guesses a country from a national-format number", () => {
    // A Swiss 0XX number and a French 0XX number are both national format with
    // no country code — the filter refuses to claim either, unlike phoneGeo.
    expect(phoneRegionKey("079 123 45 67")).toBe(PHONE_REGION_UNKNOWN);
    expect(phoneRegionKey("06 12 34 56 78")).toBe(PHONE_REGION_UNKNOWN);
  });

  it("buckets an international prefix with an unknown code as 'unknown'", () => {
    expect(phoneRegionKey("+998 90 123 4567")).toBe(PHONE_REGION_UNKNOWN); // Uzbekistan, not in table
  });

  it("strips formatting noise and extensions before matching", () => {
    expect(phoneRegionKey("+41 (0)22 123 45 67")).toBe("41");
    expect(phoneRegionKey("+44-20-7946-0958 x12")).toBe("44");
  });
});

describe("phoneRegionLabel", () => {
  it("labels the sentinel buckets in French", () => {
    expect(phoneRegionLabel(PHONE_REGION_NONE)).toBe("Sans numéro");
    expect(phoneRegionLabel(PHONE_REGION_UNKNOWN)).toBe("Indicatif inconnu");
  });

  it("labels a known dial code with name + prefix", () => {
    expect(phoneRegionLabel("41")).toBe("Suisse · +41");
    expect(phoneRegionLabel("33")).toBe("France · +33");
  });

  it("falls back to the bare prefix for a code with no name", () => {
    expect(phoneRegionLabel("998")).toBe("+998");
  });
});

describe("phoneRegionKeySql", () => {
  const sql = phoneRegionKeySql('"contacts"."phone"');

  it("emits the none / unknown sentinels and the min-digit guard", () => {
    expect(sql).toContain(`THEN '${PHONE_REGION_NONE}'`);
    expect(sql).toContain(`ELSE '${PHONE_REGION_UNKNOWN}'`);
    expect(sql).toContain("length(");
    expect(sql).toContain("LIKE '+%'");
    expect(sql).toContain("LIKE '00%'");
  });

  it("includes a WHEN for every country in the table", () => {
    for (const c of PHONE_COUNTRIES) {
      expect(sql).toContain(`THEN '${c.dial}'`);
    }
  });

  it("orders longer dial codes before the prefixes they contain", () => {
    // 423 must be tested before 41, and 352 before 33-adjacent 2-digit codes,
    // else a Liechtenstein/Luxembourg number would be mis-bucketed in SQL.
    expect(sql.indexOf("LIKE '423%'")).toBeLessThan(sql.indexOf("LIKE '41%'"));
    expect(sql.indexOf("LIKE '212%'")).toBeLessThan(sql.indexOf("LIKE '1%'"));
    expect(sql.indexOf("LIKE '352%'")).toBeLessThan(sql.indexOf("LIKE '32%'"));
  });
});
