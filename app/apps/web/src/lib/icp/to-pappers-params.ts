/**
 * Translate ICP criteria → Pappers /v2/recherche params (France registry
 * sourcing). The France twin of to-apollo-params. Pure.
 *
 * Pappers is France-only, so this returns ok:false when the ICP has no
 * French region (e.g. a Swiss-only ICP) — the caller then skips Pappers
 * and sources that ICP via Apollo/Cognism/Zefix instead.
 *
 * Maps: industry → code_naf (precise sector), geography → French regions,
 * employee_count → INSEE tranche_effectif. Tech/keyword/persona/funding
 * criteria have no registry equivalent and are left for the scoring layer
 * (or Apollo) — the registry seed is firmographic.
 */

import type { Criterion } from "./criteria-engine";
import {
  nafForIndustries,
  frenchRegions,
  employeeRangeToTranches,
} from "@/lib/integrations/pappers-codes";

export interface PappersSearchParams {
  code_naf?: string[];
  region?: string[];
  tranche_effectif?: string[];
}

export interface PappersTranslation {
  ok: boolean;
  params: PappersSearchParams;
  /** Why ok:false — surfaced to the caller/logs. */
  reason?: string;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === null || v === undefined || v === "") return [];
  return [String(v)];
}

export function criteriaToPappersParams(criteria: Criterion[]): PappersTranslation {
  const params: PappersSearchParams = {};

  const geo = criteria.find((c) => c.fieldKey === "geography");
  const regions = geo ? frenchRegions(asStringArray(geo.value)) : [];
  if (regions.length === 0) {
    return {
      ok: false,
      params,
      reason: "no French region in geography — Pappers is France-only (use Apollo/Cognism/Zefix for CH)",
    };
  }
  params.region = regions;

  const industry = criteria.find((c) => c.fieldKey === "industry");
  if (industry) {
    const naf = nafForIndustries(asStringArray(industry.value));
    if (naf.length > 0) params.code_naf = naf;
  }

  const emp = criteria.find((c) => c.fieldKey === "employee_count");
  if (emp && emp.operator === "between") {
    const v = (emp.value as { min?: number; max?: number }) ?? {};
    const tranches = employeeRangeToTranches(v.min ?? null, v.max ?? null);
    if (tranches.length > 0) params.tranche_effectif = tranches;
  }

  return { ok: true, params };
}
