/**
 * Map a prospect's E.164 phone number to a representative IANA timezone, so the
 * dashboard can show "best time to call" in the PROSPECT's local time, not just
 * the rep's. Pure + tested.
 *
 * Single-timezone countries map to their zone; genuinely multi-timezone ones
 * (US, Canada, Russia, Australia, Brazil…) return null rather than guess a wrong
 * local hour — a wrong "best time" is worse than none. For a same-timezone
 * market (e.g. Suisse romande calling CET) this collapses onto the rep's own
 * zone, which is why the caller only surfaces it when the zones actually differ.
 */

/** Country calling code → representative IANA zone. Longest prefix wins, so
 * multi-digit codes (352, 358…) are matched before single-digit ones. */
const CODE_TO_TZ: Record<string, string> = {
  // Western / Central Europe (CET/CEST — collapses together, but explicit)
  "41": "Europe/Zurich", // CH
  "33": "Europe/Paris", // FR
  "49": "Europe/Berlin", // DE
  "39": "Europe/Rome", // IT
  "32": "Europe/Brussels", // BE
  "31": "Europe/Amsterdam", // NL
  "34": "Europe/Madrid", // ES
  "43": "Europe/Vienna", // AT
  "352": "Europe/Luxembourg", // LU
  "351": "Europe/Lisbon", // PT (WET)
  "44": "Europe/London", // GB (WET)
  "353": "Europe/Dublin", // IE
  "45": "Europe/Copenhagen", // DK
  "46": "Europe/Stockholm", // SE
  "47": "Europe/Oslo", // NO
  "358": "Europe/Helsinki", // FI (EET)
  "48": "Europe/Warsaw", // PL
  "420": "Europe/Prague", // CZ
  "30": "Europe/Athens", // GR (EET)
  // Selected single-zone elsewhere
  "972": "Asia/Jerusalem", // IL
  "971": "Asia/Dubai", // AE
  "65": "Asia/Singapore", // SG
  "852": "Asia/Hong_Kong", // HK
  "81": "Asia/Tokyo", // JP
  "82": "Asia/Seoul", // KR
  "212": "Africa/Casablanca", // MA
  "27": "Africa/Johannesburg", // ZA
};

/** Country codes that span multiple zones — never guess a local hour for these. */
const MULTI_TZ_CODES = new Set(["1", "7", "61", "55", "86", "91", "52", "54", "62", "60"]);

/**
 * Resolve an E.164 number to a representative IANA timezone, or null when the
 * country is multi-timezone or unknown.
 */
export function phoneToTimezone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const trimmed = e164.trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.slice(1).replace(/\D/g, "");
  if (digits.length < 4) return null;

  // Longest known prefix first (up to 3 digits), then the multi-tz guard.
  for (let len = 3; len >= 1; len--) {
    const prefix = digits.slice(0, len);
    if (CODE_TO_TZ[prefix]) return CODE_TO_TZ[prefix];
    if (MULTI_TZ_CODES.has(prefix)) return null;
  }
  return null;
}

/**
 * Hour-of-day (0-23) of a UTC instant in a given IANA zone. Deterministic via
 * Intl with an explicit h23 cycle (so midnight is 0, never 24).
 */
export function hourInTimezone(at: Date, tz: string): number | null {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(at);
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? ((h % 24) + 24) % 24 : null;
  } catch {
    return null;
  }
}
