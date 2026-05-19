/**
 * Local-presence number selection.
 *
 * Given the prospect's E.164, picks the most credible `from` number
 * from the tenant's pool. Preference order:
 *   1. Same country + same area code (US specifically — area codes matter most)
 *   2. Same country (any area code)
 *   3. Any active number for the tenant
 *
 * No match → returns null and the route returns 503 telling the
 * tenant to provision a number in Settings → Voice.
 */

import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface ParsedNumber {
  countryCode: string | null;
  areaCode: string | null;
}

export function parseE164(e164: string): ParsedNumber {
  // Lightweight parser — sufficient for FR/US/CA/GB/BE/CH which cover
  // ~99% of Elevay's expected pipeline. Full libphonenumber-js can be
  // swapped in if/when we expand.
  if (!e164.startsWith("+")) return { countryCode: null, areaCode: null };
  const digits = e164.slice(1);
  // US/CA — +1NPANXXXXXX
  if (digits.startsWith("1") && digits.length === 11) {
    return { countryCode: "US", areaCode: digits.slice(1, 4) };
  }
  // FR mobile/fixed — +33XXXXXXXXX (the leading "0" is dropped)
  if (digits.startsWith("33") && digits.length === 11) {
    return { countryCode: "FR", areaCode: digits.slice(2, 3) };
  }
  if (digits.startsWith("44")) return { countryCode: "GB", areaCode: null };
  if (digits.startsWith("32")) return { countryCode: "BE", areaCode: null };
  if (digits.startsWith("41")) return { countryCode: "CH", areaCode: null };
  if (digits.startsWith("49")) return { countryCode: "DE", areaCode: null };
  if (digits.startsWith("34")) return { countryCode: "ES", areaCode: null };
  if (digits.startsWith("39")) return { countryCode: "IT", areaCode: null };
  if (digits.startsWith("31")) return { countryCode: "NL", areaCode: null };
  if (digits.startsWith("351")) return { countryCode: "PT", areaCode: null };
  if (digits.startsWith("353")) return { countryCode: "IE", areaCode: null };
  return { countryCode: null, areaCode: null };
}

export async function selectFromNumber(
  tenantId: string,
  prospectE164: string,
): Promise<{ e164: string; twilioSid: string } | null> {
  const parsed = parseE164(prospectE164);

  // Try exact country + area code match.
  if (parsed.countryCode && parsed.areaCode) {
    const exact = await db
      .select({ e164: phoneNumberPool.e164, twilioSid: phoneNumberPool.twilioSid })
      .from(phoneNumberPool)
      .where(
        and(
          eq(phoneNumberPool.tenantId, tenantId),
          eq(phoneNumberPool.countryCode, parsed.countryCode),
          eq(phoneNumberPool.areaCode, parsed.areaCode),
          eq(phoneNumberPool.active, true),
        ),
      )
      .limit(1);
    if (exact.length > 0) return exact[0];
  }

  // Same country, any area code.
  if (parsed.countryCode) {
    const sameCountry = await db
      .select({ e164: phoneNumberPool.e164, twilioSid: phoneNumberPool.twilioSid })
      .from(phoneNumberPool)
      .where(
        and(
          eq(phoneNumberPool.tenantId, tenantId),
          eq(phoneNumberPool.countryCode, parsed.countryCode),
          eq(phoneNumberPool.active, true),
        ),
      )
      .limit(1);
    if (sameCountry.length > 0) return sameCountry[0];
  }

  // Any active number for the tenant.
  const any = await db
    .select({ e164: phoneNumberPool.e164, twilioSid: phoneNumberPool.twilioSid })
    .from(phoneNumberPool)
    .where(
      and(
        eq(phoneNumberPool.tenantId, tenantId),
        eq(phoneNumberPool.active, true),
      ),
    )
    .limit(1);
  if (any.length > 0) return any[0];

  return null;
}

// Two-party consent regions where recording disclosure must be played
// before any content is captured. France treats voice recording as
// personal data; the US states listed are "all-party" jurisdictions.
const TWO_PARTY_CONSENT_COUNTRIES = new Set(["FR", "CA"]);
const TWO_PARTY_CONSENT_US_AREA_CODES = new Set<string>([
  // California
  "213", "310", "323", "408", "415", "424", "510", "530", "559", "562",
  "619", "626", "650", "657", "661", "669", "707", "714", "747", "760",
  "805", "818", "820", "831", "858", "909", "916", "925", "949", "951",
  // Illinois
  "217", "224", "309", "312", "331", "447", "464", "618", "630", "708",
  "773", "779", "815", "847", "872",
  // Florida
  "239", "305", "321", "352", "386", "407", "448", "561", "656", "689",
  "727", "754", "772", "786", "813", "850", "863", "904", "941", "954",
  // Pennsylvania
  "215", "223", "267", "272", "412", "445", "484", "570", "582", "610",
  "717", "724", "814", "835", "878",
  // Massachusetts
  "339", "351", "413", "508", "617", "774", "781", "857", "978",
  // Maryland
  "227", "240", "301", "410", "443", "667",
  // Nevada
  "702", "725", "775",
  // New Hampshire
  "603",
  // Washington
  "206", "253", "360", "425", "509", "564",
]);

export function requiresTwoPartyConsent(prospectE164: string): boolean {
  const parsed = parseE164(prospectE164);
  if (!parsed.countryCode) return true; // err on safety
  if (TWO_PARTY_CONSENT_COUNTRIES.has(parsed.countryCode)) return true;
  if (
    parsed.countryCode === "US" &&
    parsed.areaCode &&
    TWO_PARTY_CONSENT_US_AREA_CODES.has(parsed.areaCode)
  ) {
    return true;
  }
  return false;
}
