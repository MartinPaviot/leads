/**
 * Contact title → seniority tier styling, the single source of truth for how
 * a job-title chip renders (contacts table, entity-link popover).
 *
 * SCOPE — titles are FREE TEXT (448 distinct values on 612 titled contacts as
 * of 2026-06-11), so unlike industries there is no fixed vocabulary to map.
 * The tier therefore comes EXCLUSIVELY from the stored Apollo `seniority`
 * enum (properties.seniority, filled by people enrichment on ~62% of
 * contacts) — the title text itself is never parsed or keyword-matched
 * (see feedback: no hardcoded matching). Contacts without a seniority value
 * render as a neutral chip with no icon: "unclassified", honestly.
 *
 * Four tiers, colored as a power ramp so the eye finds decision-makers:
 *   exec  (owner/founder/c_suite/partner)  — gold
 *   lead  (vp/head/director)               — indigo
 *   mgmt  (manager/senior)                 — teal
 *   team  (entry/intern)                   — slate
 * Tokens --sen-<tier> / --sen-<tier>-bg live in globals.css with separate
 * light and dark values, AA contrast in both.
 */

export type SeniorityTier = "exec" | "lead" | "mgmt" | "team" | "unknown";

export interface TitleStyle {
  tier: SeniorityTier;
  /** Human label for tooltips ("Executive"); null for unknown. The chip
   *  icon is NOT per-tier — TitleBadge renders one sober Briefcase for
   *  every title; tier identity is color + this label. */
  label: string | null;
  /** Text + icon color — CSS var, theme-aware. */
  color: string;
  /** Soft tint background — CSS var, theme-aware. */
  bg: string;
}

const TIER_TOKENS: Record<Exclude<SeniorityTier, "unknown">, { color: string; bg: string }> = {
  exec: { color: "var(--sen-exec)", bg: "var(--sen-exec-bg)" },
  lead: { color: "var(--sen-lead)", bg: "var(--sen-lead-bg)" },
  mgmt: { color: "var(--sen-mgmt)", bg: "var(--sen-mgmt-bg)" },
  team: { color: "var(--sen-team)", bg: "var(--sen-team-bg)" },
};

const TIER_LABELS: Record<Exclude<SeniorityTier, "unknown">, string> = {
  exec: "Executive",
  lead: "Leadership",
  mgmt: "Management",
  team: "Team",
};

/** Apollo's people-seniority enum, exhaustively. Keys are the canonical
 * snake_case API form; normalize() folds the ICP-picker display form
 * ("C-Suite") onto it. */
const SENIORITY_TIER: Record<string, Exclude<SeniorityTier, "unknown">> = {
  owner: "exec",
  founder: "exec",
  c_suite: "exec",
  partner: "exec",
  vp: "lead",
  head: "lead",
  director: "lead",
  manager: "mgmt",
  senior: "mgmt",
  entry: "team",
  intern: "team",
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Resolve a stored seniority value to its chip style. Never throws; null,
 * empty or out-of-enum values get the neutral "unknown" style.
 */
export function seniorityStyle(seniority: string | null | undefined): TitleStyle {
  const tier = seniority ? SENIORITY_TIER[normalize(seniority)] : undefined;
  if (!tier) {
    return {
      tier: "unknown",
      label: null,
      color: "var(--color-text-secondary)",
      bg: "var(--color-bg-hover)",
    };
  }
  return { tier, label: TIER_LABELS[tier], ...TIER_TOKENS[tier] };
}

/** Exported for tests — the curated seniority vocabulary. */
export const SENIORITY_VOCABULARY: ReadonlyArray<string> = Object.keys(SENIORITY_TIER);
