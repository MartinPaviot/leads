/**
 * Phone region (country dial code) — SSOT for the Contacts "Phone" filter.
 *
 * Maps a raw phone string to a stable region key the list filters on:
 *   - a country dial code without "+" (e.g. "41" Suisse, "33" France)
 *   - "none"     → no usable number on file
 *   - "unknown"  → has a number but no derivable country code (national format)
 *
 * ITU E.164 country codes are a fixed international standard (not a heuristic),
 * so a literal table is the correct source of truth — extend PHONE_COUNTRIES as
 * new markets appear. Matching is longest-prefix so multi-digit codes (352, 423)
 * win over their shorter neighbours (35-, 41-).
 *
 * Deliberately STRICTER than lib/calllist/reachability.ts#phoneGeo (which, for
 * the call-mode hover, assumes a national-format number on a romand list is
 * Swiss): a *filter* must not invent a country, so a number with no "+"/"00"
 * international prefix is bucketed "unknown" rather than claimed as CH. That is
 * what keeps the +41-vs-+33 split — the whole point of the filter — trustworthy.
 *
 * Pure + client/server safe (no DB, no vendor names): the page imports the
 * labels, the /api/contacts route embeds phoneRegionKeySql() for server-side
 * filtering + facet counts (the list paginates, so the bucket must be computed
 * in SQL, not over the loaded page).
 */

export interface PhoneCountry {
  /** Dial code, digits only, no "+". */
  dial: string;
  /** ISO 3166-1 alpha-2. */
  iso: string;
  /** French country name shown in the filter option. */
  label: string;
}

/** Curated dial-code table for a Suisse-romande B2B motion: Switzerland + its
 *  neighbours and micro-states first, then wider Western/Central Europe, North
 *  America, and the francophone Maghreb (cross-border execs we actually see).
 *  Order here is irrelevant — matching sorts by code length descending. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  // Switzerland + immediate neighbours / micro-states (romand core).
  { dial: "41", iso: "CH", label: "Suisse" },
  { dial: "33", iso: "FR", label: "France" },
  { dial: "49", iso: "DE", label: "Allemagne" },
  { dial: "39", iso: "IT", label: "Italie" },
  { dial: "43", iso: "AT", label: "Autriche" },
  { dial: "423", iso: "LI", label: "Liechtenstein" },
  { dial: "377", iso: "MC", label: "Monaco" },
  // Wider Western / Central Europe.
  { dial: "32", iso: "BE", label: "Belgique" },
  { dial: "352", iso: "LU", label: "Luxembourg" },
  { dial: "31", iso: "NL", label: "Pays-Bas" },
  { dial: "44", iso: "GB", label: "Royaume-Uni" },
  { dial: "353", iso: "IE", label: "Irlande" },
  { dial: "34", iso: "ES", label: "Espagne" },
  { dial: "351", iso: "PT", label: "Portugal" },
  { dial: "30", iso: "GR", label: "Grèce" },
  { dial: "45", iso: "DK", label: "Danemark" },
  { dial: "46", iso: "SE", label: "Suède" },
  { dial: "47", iso: "NO", label: "Norvège" },
  { dial: "358", iso: "FI", label: "Finlande" },
  { dial: "48", iso: "PL", label: "Pologne" },
  { dial: "420", iso: "CZ", label: "Tchéquie" },
  // North America (NANP).
  { dial: "1", iso: "US", label: "États-Unis / Canada" },
  // Francophone Maghreb + common MEA.
  { dial: "212", iso: "MA", label: "Maroc" },
  { dial: "213", iso: "DZ", label: "Algérie" },
  { dial: "216", iso: "TN", label: "Tunisie" },
  { dial: "971", iso: "AE", label: "Émirats arabes unis" },
  { dial: "972", iso: "IL", label: "Israël" },
];

export const PHONE_REGION_NONE = "none";
export const PHONE_REGION_UNKNOWN = "unknown";

/** Matchers, longest dial code first, so 352/423/212 win over 35-/41-/21-. */
const BY_LEN_DESC = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
const LABEL_BY_DIAL = new Map(PHONE_COUNTRIES.map((c) => [c.dial, c.label]));

/** Minimum digit count for a usable number (below = noise / partial). Mirrors
 *  phoneGeo so both surfaces agree on what counts as "has a number". */
export const PHONE_MIN_DIGITS = 8;

/**
 * Region key for a raw phone string: a dial code, "none", or "unknown".
 * Never guesses a country from a national-format number (no "+"/"00") — that
 * is the deliberate strictness the filter relies on.
 */
export function phoneRegionKey(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length < PHONE_MIN_DIGITS) return PHONE_REGION_NONE;
  const intl = s.startsWith("+") || digits.startsWith("00");
  if (!intl) return PHONE_REGION_UNKNOWN; // national format — origin not provable
  const body = digits.startsWith("00") ? digits.slice(2) : digits;
  for (const c of BY_LEN_DESC) if (body.startsWith(c.dial)) return c.dial;
  return PHONE_REGION_UNKNOWN; // international prefix, code not in the table
}

/** French label for a region key (dial code / "none" / "unknown"). */
export function phoneRegionLabel(key: string): string {
  if (key === PHONE_REGION_NONE) return "Sans numéro";
  if (key === PHONE_REGION_UNKNOWN) return "Indicatif inconnu";
  const name = LABEL_BY_DIAL.get(key);
  return name ? `${name} · +${key}` : `+${key}`;
}

/**
 * SQL `CASE` yielding the region key for a phone column, generated from the
 * same PHONE_COUNTRIES table as phoneRegionKey() so the country set can't
 * drift. `col` is a SQL expression for the phone text (e.g. '"contacts"."phone"').
 * Dial codes come from our own constant table (digits only) → no injection
 * surface. Embed via drizzle's sql.raw(), like EFFECTIVE_LIFECYCLE_STAGE_SQL.
 */
export function phoneRegionKeySql(col: string): string {
  // Digits only (drop spaces, dots, dashes, parens, '+', any letters/extension).
  const digits = `regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;
  // International iff the trimmed value starts with '+' OR its digits start "00".
  const isIntl = `(btrim(${col}) LIKE '+%' OR ${digits} LIKE '00%')`;
  // Body after stripping a leading "00" international prefix.
  const body = `(CASE WHEN ${digits} LIKE '00%' THEN substr(${digits}, 3) ELSE ${digits} END)`;
  const whens = BY_LEN_DESC.map(
    (c) => `WHEN ${body} LIKE '${c.dial}%' THEN '${c.dial}'`,
  ).join("\n        ");
  return `CASE
    WHEN length(${digits}) < ${PHONE_MIN_DIGITS} THEN '${PHONE_REGION_NONE}'
    WHEN NOT ${isIntl} THEN '${PHONE_REGION_UNKNOWN}'
    ELSE (CASE
        ${whens}
        ELSE '${PHONE_REGION_UNKNOWN}'
      END)
  END`;
}
