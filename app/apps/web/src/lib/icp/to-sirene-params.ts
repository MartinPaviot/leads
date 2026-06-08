/**
 * Translate ICP criteria → SIRENE (recherche-entreprises) search params.
 * The keyless French twin of to-pappers-params. Pure.
 *
 * SIRENE is sector-driven: it filters by NAF (activite_principale) +
 * INSEE effectif tranche. Industry → NAF and effectif → tranche reuse the
 * Pappers code maps. Returns ok:false for a non-French ICP, or when the
 * ICP has no NAF-mappable industry (an unfiltered SIRENE search would
 * return all of France).
 */
import type { Criterion } from "./criteria-engine";
import {
  nafForIndustries,
  frenchRegions,
  employeeRangeToTranches,
} from "@/lib/integrations/pappers-codes";

export interface SireneSearchParams {
  activite_principale?: string[];
  tranche_effectif_salarie?: string[];
}

export interface SireneTranslation {
  ok: boolean;
  params: SireneSearchParams;
  reason?: string;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === null || v === undefined || v === "") return [];
  return [String(v)];
}

export function criteriaToSireneParams(criteria: Criterion[]): SireneTranslation {
  const params: SireneSearchParams = {};

  const geo = criteria.find((c) => c.fieldKey === "geography");
  const fr = geo ? frenchRegions(asStringArray(geo.value)) : [];
  if (fr.length === 0) {
    return {
      ok: false,
      params,
      reason: "no French region — SIRENE is France-only (use Apollo/Zefix)",
    };
  }

  const industry = criteria.find((c) => c.fieldKey === "industry");
  const naf = industry ? nafForIndustries(asStringArray(industry.value)) : [];
  if (naf.length === 0) {
    return {
      ok: false,
      params,
      reason: "no NAF-mappable industry — SIRENE sourcing is sector-driven",
    };
  }
  params.activite_principale = naf;

  const emp = criteria.find((c) => c.fieldKey === "employee_count");
  if (emp && emp.operator === "between") {
    const v = (emp.value as { min?: number; max?: number }) ?? {};
    const tranches = employeeRangeToTranches(v.min ?? null, v.max ?? null);
    if (tranches.length > 0) params.tranche_effectif_salarie = tranches;
  }

  return { ok: true, params };
}
