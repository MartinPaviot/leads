/**
 * Map human technology names → Apollo `technology_uids` (P3,
 * _specs/multi-icp). Pure.
 *
 * Apollo's `currently_using_any_of_technology_uids` filter expects
 * slug-style UIDs, not display names ("datadog", not "Datadog"). A
 * criterion authored in the rule-builder / by a founder uses display
 * names; this normalises them before the org search.
 *
 * IMPORTANT — these UIDs are BEST-EFFORT on Apollo's slug convention
 * (lowercase, spaces/dots → underscores). They are NOT verified
 * against Apollo's live technology taxonomy (the sandbox can't reach
 * Apollo to confirm). When a `Build TAM` returns thin/zero on the
 * tech filter, validate the offending UID against Apollo's
 * /api/v1/technologies or the Apollo UI's technology filter and add a
 * correction to KNOWN_TECH_UIDS. The fallback normaliser handles the
 * common case; the dictionary pins the ones whose slug isn't a plain
 * lowercasing (e.g. "MongoDB Atlas" → "mongodb").
 */

const KNOWN_TECH_UIDS: Record<string, string> = {
  // Pilae ICP-1 proof-of-spend stack
  datadog: "datadog",
  "new relic": "new_relic",
  newrelic: "new_relic",
  snowflake: "snowflake",
  okta: "okta",
  auth0: "auth0",
  segment: "segment",
  vercel: "vercel",
  launchdarkly: "launchdarkly",
  pagerduty: "pagerduty",
  looker: "looker",
  tableau: "tableau",
  "mongodb atlas": "mongodb",
  mongodb: "mongodb",
  confluent: "confluent",
  // ICP-2 + common cloud
  aws: "amazon_aws",
  "amazon web services": "amazon_aws",
  azure: "microsoft_azure",
  "microsoft azure": "microsoft_azure",
  gcp: "google_cloud",
  "google cloud": "google_cloud",
};

/** Normalise a single technology name to an Apollo UID. */
export function toTechnologyUid(name: string): string {
  const key = name.trim().toLowerCase();
  if (KNOWN_TECH_UIDS[key]) return KNOWN_TECH_UIDS[key];
  // Fallback: Apollo slug convention — lowercase, collapse any run of
  // non-alphanumerics to a single underscore, trim underscores.
  return key
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Map an array of technology names to UIDs, de-duplicated. */
export function toTechnologyUids(names: unknown): string[] {
  const arr = Array.isArray(names) ? names : names == null ? [] : [names];
  const out = new Set<string>();
  for (const n of arr) {
    const uid = toTechnologyUid(String(n));
    if (uid) out.add(uid);
  }
  return [...out];
}
