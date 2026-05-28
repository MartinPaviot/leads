/**
 * Geo-detection for EU/EEA users.
 *
 * Priority (FINDING-004 AC-6):
 *   1. x-vercel-ip-country  (Vercel edge — primary)
 *   2. cf-ipcountry         (Cloudflare proxy fallback)
 *   3. x-country-code       (custom proxy fallback)
 *   4. Email TLD            (last-resort heuristic)
 *   5. Safe-by-default      (treat as EU in prod when no signal at all)
 *
 * The safe-by-default rule means we err on the side of GDPR consent
 * gates: showing a consent banner to a US visitor is annoying, but
 * skipping it for an EU visitor is a regulatory breach.
 */

import { EU_COUNTRY_CODES, EU_EMAIL_TLDS } from "./region-config";

export interface GeoSignal {
  isEu: boolean;
  source: "geo-header" | "email-tld" | "default-eu" | "default-non-eu";
  country?: string;
}

/**
 * Determine if a request likely originates from an EU/EEA/CH/UK user.
 * Pass the participant email when known to enable the TLD fallback.
 */
export function detectGeo(
  req: Request,
  participantEmail?: string | null,
): GeoSignal {
  // 1-3: header-based geo (priority)
  const country = (
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-country-code") ||
    ""
  )
    .trim()
    .toUpperCase();

  if (country) {
    return {
      isEu: EU_COUNTRY_CODES.has(country),
      source: "geo-header",
      country,
    };
  }

  // 4: email TLD fallback
  if (participantEmail) {
    const parts = participantEmail.toLowerCase().split(".");
    const tld = parts.length >= 3
      ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` // co.uk
      : parts[parts.length - 1];
    const lastTld = parts[parts.length - 1];
    if ((tld && EU_EMAIL_TLDS.has(tld)) || (lastTld && EU_EMAIL_TLDS.has(lastTld))) {
      return { isEu: true, source: "email-tld" };
    }
  }

  // 5: safe-by-default — prod = EU, dev = non-EU (avoids dev friction)
  if (process.env.NODE_ENV === "production") {
    return { isEu: true, source: "default-eu" };
  }
  return { isEu: false, source: "default-non-eu" };
}

/** Convenience wrapper that returns a boolean. */
export function isLikelyEu(
  req: Request,
  participantEmail?: string | null,
): boolean {
  return detectGeo(req, participantEmail).isEu;
}
