/**
 * Person targeting for people-sourcing (Apollo searches) — ONE source
 * of truth (founder ask 2026-06-12: "a contact search must only find
 * people that fit my ICP").
 *
 * Primary source: the ACTIVE ICP profiles' person criteria —
 * `person_titles` (the same vocabulary the contact scorer matches
 * against) and `person_seniorities`. Sourcing and scoring therefore
 * agree by construction: what gets fetched is what scores high.
 *
 * Seniorities are only sent when actually configured: deriving them
 * from title keywords (the old per-route regex heuristics) silently
 * EXCLUDED wanted people — Apollo ANDs the two facets, so e.g. an
 * Owner (seniority "owner") was dropped because the heuristic only
 * ever emitted "founder".
 *
 * Legacy fallback (no person criteria on any active profile): the
 * flats mirror — titles from deriveTargetRoles, seniorities from the
 * user's explicit targetSeniorities selection, else the historical
 * keyword heuristic over the roles string. When NOTHING is configured
 * anywhere, the decision-maker seniorities default applies: a people
 * search must never run unfiltered (it would page through every
 * employee and burn credits).
 */

import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import { personaVocabulary } from "@/lib/scoring/title-persona";
import { norm } from "@/lib/icp/criteria-engine";
import {
  getTenantSettings,
  deriveTargetRoles,
} from "@/lib/config/tenant-settings";
import { senioritiesToApollo } from "@/lib/config/icp-constants";

export type PersonTargeting = {
  /** Apollo `person_titles` — undefined when nothing is configured. */
  titles: string[] | undefined;
  /** Apollo `person_seniorities` — undefined unless explicitly configured. */
  seniorities: string[] | undefined;
  source: "icp_profiles" | "legacy_settings";
};

/** Union of every active ICP's person_seniorities values (norm-deduped,
 *  first-seen casing) — the sibling of personaVocabulary for titles. */
function senioritiesFromIcps(
  activeIcps: Awaited<ReturnType<typeof loadActiveIcps>>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const icp of activeIcps) {
    for (const c of icp.criteria) {
      if (c.fieldKey !== "person_seniorities") continue;
      const values = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of values) {
        if (typeof v !== "string" || v.trim() === "") continue;
        const k = norm(v);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v.trim());
      }
    }
  }
  return out;
}

/** Historical keyword heuristic (was duplicated in extract-contacts and
 *  suggested-contacts) — legacy fallback only. */
function legacyDeriveSeniorities(targetRoles: string): string[] {
  const lower = targetRoles.toLowerCase();
  const seniorities = new Set<string>();
  if (/\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcro\b|\bcmo\b|\bc-suite\b|\bchief\b/.test(lower)) seniorities.add("c_suite");
  if (/\bfounder\b|\bco-founder\b|\bowner\b/.test(lower)) seniorities.add("founder");
  if (/\bvp\b|\bvice president\b/.test(lower)) seniorities.add("vp");
  if (/\bdirector\b|\bhead of\b/.test(lower)) seniorities.add("director");
  if (/\bmanager\b/.test(lower)) seniorities.add("manager");
  if (/\bsenior\b|\blead\b|\bprincipal\b/.test(lower)) seniorities.add("senior");
  return seniorities.size > 0 ? Array.from(seniorities) : ["c_suite", "vp", "director", "founder"];
}

export async function getIcpPersonTargeting(tenantId: string): Promise<PersonTargeting> {
  const activeIcps = await loadActiveIcps(tenantId);
  const titles = personaVocabulary(activeIcps);
  const seniorities = senioritiesFromIcps(activeIcps);

  if (titles.length > 0 || seniorities.length > 0) {
    return {
      titles: titles.length > 0 ? titles : undefined,
      seniorities: seniorities.length > 0 ? seniorities : undefined,
      source: "icp_profiles",
    };
  }

  const settings = await getTenantSettings(tenantId);
  const targetRoles = deriveTargetRoles(settings);
  const legacyTitles = targetRoles
    ? targetRoles.split(/[,;]/).map((r) => r.trim()).filter(Boolean)
    : [];
  const legacySeniorities = settings.targetSeniorities?.length
    ? senioritiesToApollo(settings.targetSeniorities)
    : targetRoles
      ? legacyDeriveSeniorities(targetRoles)
      : [];

  // Never unfiltered: with no titles AND no seniorities from anywhere,
  // keep the historical decision-maker net.
  if (legacyTitles.length === 0 && legacySeniorities.length === 0) {
    return {
      titles: undefined,
      seniorities: ["c_suite", "vp", "director", "founder"],
      source: "legacy_settings",
    };
  }

  return {
    titles: legacyTitles.length > 0 ? legacyTitles : undefined,
    seniorities: legacySeniorities.length > 0 ? legacySeniorities : undefined,
    source: "legacy_settings",
  };
}
