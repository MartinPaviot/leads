/**
 * Speakable geography for the call cockpit — pure, no I/O.
 *
 * Two sources, by precision:
 *   1. The company's enrichment location string ("Lausanne, Vaud, Suisse" —
 *      city/state/country deduped, built by company-brain). Its FIRST segment
 *      is the most precise component we actually hold (city, else canton,
 *      else country) — the one a rep can say out loud.
 *   2. The contact's computed timezone → country label. We deliberately stop
 *      at the country there: a timezone has no reliable city/canton, so we
 *      never fake one.
 *
 * Returns null when neither is known — callers keep their honest fallback
 * ("votre région"), never an invented place.
 */

const TZ_COUNTRY: Record<string, string> = {
  "Europe/Zurich": "Suisse",
  "Europe/Paris": "France",
  "Europe/Brussels": "Belgique",
  "Europe/Luxembourg": "Luxembourg",
  "Europe/Monaco": "Monaco",
  "Europe/London": "Royaume-Uni",
  "Europe/Berlin": "Allemagne",
  "Europe/Madrid": "Espagne",
  "Europe/Rome": "Italie",
  "Europe/Lisbon": "Portugal",
  "Europe/Amsterdam": "Pays-Bas",
};

/** Country-level geography derived from an IANA timezone (mapped countries
 * first, else the timezone's own city segment, e.g. "America/New_York" →
 * "New York"). Null when unknown. */
export function countryFromTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  const city = tz.split("/")[1]?.replace(/_/g, " ");
  return city || null;
}

/** The most precise speakable place for the script's {geo}: first segment of
 * the enrichment location, else the timezone country. */
export function speakableGeo(
  location: string | null | undefined,
  tz: string | null | undefined,
): string | null {
  const first = (location ?? "").split(",")[0]?.trim();
  return first || countryFromTimezone(tz);
}
