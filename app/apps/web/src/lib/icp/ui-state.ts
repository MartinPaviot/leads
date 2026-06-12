/**
 * ICP editor uiState — the editor's source of truth (Phase 1,
 * _specs/icp-unification R5/D4). Pure: no DB, no fetch.
 *
 * The unified editor renders guided sections (tag lists, size chips,
 * amount ranges). What the user typed lives losslessly in
 * `icps.metadata.uiState`; the criteria rows are REGENERATED from it at
 * every save by `uiStateToCriteria` and never edited in place. Criteria
 * the widgets cannot express ("Advanced") ride alongside untouched —
 * `splitCriteria` decides which is which via GUIDED_SLOTS.
 *
 * Why a separate uiState instead of deriving widgets from criteria:
 * the criteria form is lossy (size labels collapse to a between
 * envelope, importance collapses to a weight). Round-tripping through
 * criteria would corrupt the editor on every reopen; round-tripping
 * through uiState is exact. `criteriaToUiState` (the lossy inverse)
 * exists only to ADOPT foreign profiles — AI-inferred candidates and
 * pre-Phase-1 rows — into the widgets once.
 *
 * The flat tenants.settings mirror (R5.2) is also derived from here —
 * `mirrorFromUiState` — so the ~25 legacy readers (call scripts, chat
 * context, contact scoring, warm leads, agent...) keep working without
 * a single line changed in any of them.
 */

import { sizesToEnvelope, parseSizeLabel } from "./flat-to-criteria";
import { senioritiesToApollo, COMPANY_SIZES } from "@/lib/config/icp-constants";
import type { Criterion } from "./criteria-engine";
import type { TenantSettings } from "@/lib/config/tenant-settings";

export type Importance = "nice" | "important" | "must";

/** Sections carrying an importance control (R4.4). */
export type ImportanceSection =
  | "industries"
  | "companySizes"
  | "geographies"
  | "revenue"
  | "technologies"
  | "keywords"
  | "totalFunding"
  | "hiring";

export type IcpUiState = {
  industries: string[];
  /** Exact size labels ("51-200") — sourcing uses these verbatim;
   *  scoring uses their min-max envelope (documented approximation). */
  companySizes: string[];
  geographies: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  technologies: string[];
  keywords: string[];
  totalFundingMin: number | null;
  totalFundingMax: number | null;
  minJobOpenings: number | null;
  hiringTitles: string[];
  /** JOB_SENIORITIES labels (UI form); converted to Apollo at criteria time. */
  seniorities: string[];
  personTitles: string[];
  importance: Partial<Record<ImportanceSection, Importance>>;
};

export type SourcingFilters = {
  excludeGeographies: string[];
  fundingRecencyDays: number | null;
};

export const EMPTY_UI_STATE: IcpUiState = {
  industries: [],
  companySizes: [],
  geographies: [],
  revenueMin: null,
  revenueMax: null,
  technologies: [],
  keywords: [],
  totalFundingMin: null,
  totalFundingMax: null,
  minJobOpenings: null,
  hiringTitles: [],
  seniorities: [],
  personTitles: [],
  importance: {},
};

export const EMPTY_SOURCING_FILTERS: SourcingFilters = {
  excludeGeographies: [],
  fundingRecencyDays: null,
};

/** Strong defaults (design §1.2): geography is a hard gate, identity
 *  dimensions matter, signals are nice-to-have. */
export const DEFAULT_IMPORTANCE: Record<ImportanceSection, Importance> = {
  industries: "important",
  companySizes: "important",
  geographies: "must",
  revenue: "nice",
  technologies: "nice",
  keywords: "nice",
  totalFunding: "nice",
  hiring: "nice",
};

/** R4.4: Nice → 1, Important → 3, Must → isRequired (weight inert). */
function toWeight(imp: Importance): { weight: number; isRequired: boolean } {
  if (imp === "must") return { weight: 1, isRequired: true };
  return { weight: imp === "important" ? 3 : 1, isRequired: false };
}

function importanceOf(ui: IcpUiState, section: ImportanceSection): Importance {
  return ui.importance[section] ?? DEFAULT_IMPORTANCE[section];
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `ui-${prefix}-${counter}`;
}

/**
 * The (fieldKey, operator) slots the guided widgets own. A persisted
 * criterion matching one of these (when the profile HAS a uiState) is
 * represented by a widget; everything else renders as an Advanced row.
 */
export const GUIDED_SLOTS: ReadonlySet<string> = new Set([
  "industry|in",
  "employee_count|between",
  "geography|in",
  "revenue|between",
  "technologies|in",
  "keywords|in",
  "total_funding|between",
  "num_open_jobs|gte",
  "hiring_job_titles|in",
  "person_seniorities|in",
  "person_titles|in",
]);

/** Regenerate the guided criteria from the editor state (R5.1). */
export function uiStateToCriteria(ui: IcpUiState): Array<Omit<Criterion, "id"> & { id: string }> {
  const out: Array<Omit<Criterion, "id"> & { id: string }> = [];

  if (ui.industries.length > 0) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "industries"));
    out.push({ id: nextId("industry"), fieldKey: "industry", operator: "in", value: ui.industries, weight, isRequired });
  }
  if (ui.companySizes.length > 0) {
    const envelope = sizesToEnvelope(ui.companySizes);
    if (envelope) {
      const { weight, isRequired } = toWeight(importanceOf(ui, "companySizes"));
      out.push({ id: nextId("employee_count"), fieldKey: "employee_count", operator: "between", value: envelope, weight, isRequired });
    }
  }
  if (ui.geographies.length > 0) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "geographies"));
    out.push({ id: nextId("geography"), fieldKey: "geography", operator: "in", value: ui.geographies, weight, isRequired });
  }
  if (ui.revenueMin !== null || ui.revenueMax !== null) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "revenue"));
    out.push({ id: nextId("revenue"), fieldKey: "revenue", operator: "between", value: { min: ui.revenueMin, max: ui.revenueMax }, weight, isRequired });
  }
  if (ui.technologies.length > 0) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "technologies"));
    out.push({ id: nextId("technologies"), fieldKey: "technologies", operator: "in", value: ui.technologies, weight, isRequired });
  }
  if (ui.keywords.length > 0) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "keywords"));
    out.push({ id: nextId("keywords"), fieldKey: "keywords", operator: "in", value: ui.keywords, weight, isRequired });
  }
  if (ui.totalFundingMin !== null || ui.totalFundingMax !== null) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "totalFunding"));
    out.push({ id: nextId("total_funding"), fieldKey: "total_funding", operator: "between", value: { min: ui.totalFundingMin, max: ui.totalFundingMax }, weight, isRequired });
  }
  if (ui.minJobOpenings !== null) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "hiring"));
    out.push({ id: nextId("num_open_jobs"), fieldKey: "num_open_jobs", operator: "gte", value: ui.minJobOpenings, weight, isRequired });
  }
  if (ui.hiringTitles.length > 0) {
    const { weight, isRequired } = toWeight(importanceOf(ui, "hiring"));
    out.push({ id: nextId("hiring_job_titles"), fieldKey: "hiring_job_titles", operator: "in", value: ui.hiringTitles, weight, isRequired });
  }
  // People dimension — sourcing filters AND, since the contact ICP-fit
  // scorer (lib/scoring/contact-icp-fit), scored soft criteria for
  // CONTACTS: seniorities match the enriched Apollo enum, titles go
  // through the cached title→persona resolver. The COMPANY fit engine
  // still ignores them (SOURCING_ONLY_FIELD_KEYS). Soft weight-1 here
  // on purpose: a persona miss should dent a contact's fit, not gate it.
  if (ui.seniorities.length > 0) {
    out.push({ id: nextId("person_seniorities"), fieldKey: "person_seniorities", operator: "in", value: senioritiesToApollo(ui.seniorities), weight: 1, isRequired: false });
  }
  if (ui.personTitles.length > 0) {
    out.push({ id: nextId("person_titles"), fieldKey: "person_titles", operator: "in", value: ui.personTitles, weight: 1, isRequired: false });
  }
  return out;
}

/**
 * Split persisted criteria into widget-owned vs Advanced. A profile
 * without uiState (AI/API-created pre-Phase-1) renders EVERYTHING as
 * Advanced (R4.7 — graceful, zero data loss).
 */
export function splitCriteria<T extends { fieldKey: string; operator: string }>(
  criteria: T[],
  hasUiState: boolean,
): { guided: T[]; advanced: T[] } {
  if (!hasUiState) return { guided: [], advanced: criteria };
  const guided: T[] = [];
  const advanced: T[] = [];
  for (const c of criteria) {
    (GUIDED_SLOTS.has(`${c.fieldKey}|${c.operator}`) ? guided : advanced).push(c);
  }
  return { guided, advanced };
}

/** Size labels FULLY INSIDE [min, max] — the lossy inverse used when
 *  adopting a between-envelope into the chips. Strictly-inside so the
 *  adoption never widens the targeting (51-200 fits 50-500; 10,001+
 *  does not). An envelope no whole label fits stays Advanced. */
export function coveringSizeLabels(min: number | null, max: number | null): string[] {
  const lo = min ?? 0;
  const hi = max ?? Number.POSITIVE_INFINITY;
  return COMPANY_SIZES.filter((label) => {
    const r = parseSizeLabel(label);
    const labelHi = r.max ?? Number.POSITIVE_INFINITY;
    return r.min >= lo && labelHi <= hi;
  });
}

const APOLLO_TO_SENIORITY: Record<string, string> = {
  owner: "Owner",
  founder: "Founder",
  c_suite: "C-Suite",
  partner: "Partner",
  vp: "VP",
  head: "Head",
  director: "Director",
  manager: "Manager",
  senior: "Senior",
  entry: "Entry",
};

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function rangeOf(v: unknown): { min: number | null; max: number | null } {
  const r = (v ?? {}) as { min?: unknown; max?: unknown };
  return {
    min: typeof r.min === "number" ? r.min : null,
    max: typeof r.max === "number" ? r.max : null,
  };
}

/**
 * Lossy inverse — adopt foreign criteria (AI candidates, pre-Phase-1
 * profiles) into the widgets. Returns the uiState plus the leftover
 * criteria that stay Advanced. Importance inverse: required → must,
 * weight >= 2 → important, else nice.
 */
export function criteriaToUiState<T extends { fieldKey: string; operator: string; value: unknown; weight: number; isRequired: boolean }>(
  criteria: T[],
): { uiState: IcpUiState; advanced: T[] } {
  const ui: IcpUiState = { ...EMPTY_UI_STATE, importance: {} };
  const advanced: T[] = [];

  const impOf = (c: T): Importance => (c.isRequired ? "must" : c.weight >= 2 ? "important" : "nice");
  const setImp = (section: ImportanceSection, c: T) => {
    ui.importance[section] = impOf(c);
  };

  for (const c of criteria) {
    const slot = `${c.fieldKey}|${c.operator}`;
    switch (slot) {
      case "industry|in":
        ui.industries = asStrings(c.value);
        setImp("industries", c);
        break;
      case "employee_count|between": {
        const { min, max } = rangeOf(c.value);
        ui.companySizes = coveringSizeLabels(min, max);
        setImp("companySizes", c);
        // Envelope not representable by whole labels → keep it Advanced
        // instead of silently widening/narrowing.
        if (ui.companySizes.length === 0) advanced.push(c);
        break;
      }
      case "geography|in":
        ui.geographies = asStrings(c.value);
        setImp("geographies", c);
        break;
      case "revenue|between": {
        const { min, max } = rangeOf(c.value);
        ui.revenueMin = min;
        ui.revenueMax = max;
        setImp("revenue", c);
        break;
      }
      case "technologies|in":
        ui.technologies = asStrings(c.value);
        setImp("technologies", c);
        break;
      case "keywords|in":
        ui.keywords = asStrings(c.value);
        setImp("keywords", c);
        break;
      case "total_funding|between": {
        const { min, max } = rangeOf(c.value);
        ui.totalFundingMin = min;
        ui.totalFundingMax = max;
        setImp("totalFunding", c);
        break;
      }
      case "num_open_jobs|gte":
        ui.minJobOpenings = typeof c.value === "number" ? c.value : Number(c.value) || null;
        setImp("hiring", c);
        break;
      case "hiring_job_titles|in":
        ui.hiringTitles = asStrings(c.value);
        setImp("hiring", c);
        break;
      case "person_seniorities|in":
        ui.seniorities = asStrings(c.value).map((s) => APOLLO_TO_SENIORITY[s] ?? s);
        break;
      case "person_titles|in":
        ui.personTitles = asStrings(c.value);
        break;
      default:
        advanced.push(c);
    }
  }
  return { uiState: ui, advanced };
}

/**
 * The flat tenants.settings mirror (R5.2) — written when the saved
 * profile is rank 1 (lowest priority among active profiles), so the
 * ~25 legacy flat readers stay correct with zero changes.
 */
export function mirrorFromUiState(
  ui: IcpUiState,
  sourcing: SourcingFilters,
): Partial<TenantSettings> {
  return {
    targetIndustries: ui.industries,
    targetCompanySizes: ui.companySizes,
    targetGeographies: ui.geographies,
    targetSeniorities: ui.seniorities,
    // deriveTargetRoles prefers seniorities/departments; targetRoles is
    // its legacy fallback — keep it consistent with the People section.
    targetRoles: ui.personTitles.join(", "),
    targetKeywords: ui.keywords,
    targetTechnologies: ui.technologies,
    // TenantSettings types numerics as `number | undefined`; undefined
    // keys are dropped at JSON serialization, which IS the clear
    // semantics the legacy readers expect (they all `?? null` / `||`).
    targetRevenueMin: ui.revenueMin ?? undefined,
    targetRevenueMax: ui.revenueMax ?? undefined,
    totalFundingMin: ui.totalFundingMin ?? undefined,
    totalFundingMax: ui.totalFundingMax ?? undefined,
    minJobOpenings: ui.minJobOpenings ?? undefined,
    hiringTitles: ui.hiringTitles,
    excludeGeographies: sourcing.excludeGeographies,
    fundingRecencyDays: sourcing.fundingRecencyDays ?? undefined,
  };
}

// ── Shape validation (consumed by validateIcpInput) ────────────────

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

const IMPORTANCE_VALUES = new Set(["nice", "important", "must"]);
const IMPORTANCE_SECTIONS = new Set([
  "industries", "companySizes", "geographies", "revenue",
  "technologies", "keywords", "totalFunding", "hiring",
]);

/** Validate + normalize a raw uiState payload. Returns an error string
 *  or the normalized state. */
export function parseUiState(raw: unknown): { ok: true; value: IcpUiState } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "uiState must be an object" };
  }
  const r = raw as Record<string, unknown>;
  const KNOWN_KEYS = new Set([
    "industries", "companySizes", "geographies", "technologies",
    "keywords", "hiringTitles", "seniorities", "personTitles",
    "revenueMin", "revenueMax", "totalFundingMin", "totalFundingMax",
    "minJobOpenings", "importance",
  ]);
  for (const k of Object.keys(r)) {
    if (!KNOWN_KEYS.has(k)) return { ok: false, error: `uiState: unknown key '${k}'` };
  }
  const lists: Array<keyof IcpUiState> = [
    "industries", "companySizes", "geographies", "technologies",
    "keywords", "hiringTitles", "seniorities", "personTitles",
  ];
  const ui: IcpUiState = { ...EMPTY_UI_STATE, importance: {} };
  for (const k of lists) {
    const v = r[k] ?? [];
    if (!isStringArray(v)) return { ok: false, error: `uiState.${k} must be a string array` };
    (ui as Record<string, unknown>)[k] = v;
  }
  const nums: Array<keyof IcpUiState> = [
    "revenueMin", "revenueMax", "totalFundingMin", "totalFundingMax", "minJobOpenings",
  ];
  for (const k of nums) {
    const v = r[k] ?? null;
    if (!isNumberOrNull(v)) return { ok: false, error: `uiState.${k} must be a number or null` };
    (ui as Record<string, unknown>)[k] = v;
  }
  const imp = r.importance ?? {};
  if (imp === null || typeof imp !== "object" || Array.isArray(imp)) {
    return { ok: false, error: "uiState.importance must be an object" };
  }
  for (const [k, v] of Object.entries(imp as Record<string, unknown>)) {
    if (!IMPORTANCE_SECTIONS.has(k)) return { ok: false, error: `uiState.importance: unknown section '${k}'` };
    if (typeof v !== "string" || !IMPORTANCE_VALUES.has(v)) {
      return { ok: false, error: `uiState.importance.${k} must be nice | important | must` };
    }
    ui.importance[k as ImportanceSection] = v as Importance;
  }
  return { ok: true, value: ui };
}

export function parseSourcingFilters(raw: unknown): { ok: true; value: SourcingFilters } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "sourcingFilters must be an object" };
  }
  const r = raw as Record<string, unknown>;
  const ex = r.excludeGeographies ?? [];
  if (!isStringArray(ex)) return { ok: false, error: "sourcingFilters.excludeGeographies must be a string array" };
  const days = r.fundingRecencyDays ?? null;
  if (!isNumberOrNull(days)) return { ok: false, error: "sourcingFilters.fundingRecencyDays must be a number or null" };
  return { ok: true, value: { excludeGeographies: ex, fundingRecencyDays: days } };
}
