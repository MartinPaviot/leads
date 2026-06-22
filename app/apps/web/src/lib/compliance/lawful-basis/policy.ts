/**
 * Spec 33 — lawful-basis policy tables. Source provenance (which data sources are
 * outreach-clean per the provider-ToS analysis) and per-jurisdiction acceptable
 * bases. Block is the default: an unknown source or jurisdiction is treated as
 * the strict case. Blast radius: compliance/lawful-basis/* only.
 */

export type BasisType = "legitimate_interest" | "consent";
export type SourcePolicy = "clean" | "prohibited";
export type Jurisdiction = "FR" | "CH" | "EU" | (string & {});

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * AC2 — source provenance. Owned / public registry data is outreach-clean;
 * resale-restricted provider data is prohibited for outreach reuse. Unknown
 * sources are prohibited (block by default).
 */
export const SOURCE_POLICY: Record<string, SourcePolicy> = {
  // owned / public registry — clean
  owned: "clean",
  manual: "clean",
  registry: "clean",
  sirene: "clean",
  pappers: "clean",
  zefix: "clean",
  recherche_entreprises: "clean",
  // resale/ToS-restricted providers — prohibited for outreach reuse
  apollo: "prohibited",
  hunter: "prohibited",
  lusha: "prohibited",
  kaspr: "prohibited",
  zeliq: "prohibited",
  fullenrich: "prohibited",
};

export function sourcePolicy(source: string | null | undefined): SourcePolicy {
  if (!source) return "prohibited"; // no provenance → block by default
  return SOURCE_POLICY[norm(source)] ?? "prohibited";
}

/**
 * AC5 — bases acceptable per jurisdiction. FR/CH/EU permit legitimate interest
 * (with a documented assessment) for B2B as well as consent. An unknown
 * jurisdiction falls back to consent-only (strict).
 */
export const JURISDICTION_BASES: Record<string, BasisType[]> = {
  FR: ["legitimate_interest", "consent"],
  CH: ["legitimate_interest", "consent"],
  EU: ["legitimate_interest", "consent"],
};

export function acceptableBases(jurisdiction: string | null | undefined): BasisType[] {
  if (!jurisdiction) return ["consent"];
  return JURISDICTION_BASES[jurisdiction.trim().toUpperCase()] ?? ["consent"];
}

/** Jurisdictions that mandate an opt-out in every message (FR/CH/EU at launch — all do). */
export function requiresOptOut(_jurisdiction: string | null | undefined): boolean {
  return true; // CAN-SPAM + GDPR + FR/CH all require it; conservative default
}
