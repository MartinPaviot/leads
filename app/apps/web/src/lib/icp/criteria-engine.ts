/**
 * ICP criteria evaluation + matrix scoring (P1.3 + P1.4, _specs/multi-icp).
 *
 * Pure: no DB, no Apollo, no clock. The scoring job resolves the
 * company context + the ICP's criteria from the DB, then routes them
 * through here. Keeping it pure means the whole fit-score curve is
 * unit-testable without fixtures and the matrix recompute job stays a
 * thin I/O wrapper.
 *
 * An ICP is the AND of its criteria. Each criterion is evaluated
 * against a flat company context (the enriched Apollo fields + custom
 * properties + signal booleans, pre-flattened by the caller).
 *
 * Fit score = Σ(weight of matched soft criteria) / Σ(weight of all
 * soft criteria), in [0,1]. Required criteria are hard filters: any
 * unmatched required criterion zeroes the fit and records why.
 */

import { SOURCING_ONLY_FIELD_KEYS, type CriterionOperator } from "./field-catalog";

export type Criterion = {
  id: string;
  fieldKey: string;
  operator: CriterionOperator;
  value: unknown;
  weight: number;
  isRequired: boolean;
};

/** Flat bag of company attributes the evaluator reads. Keys are the
 *  `companyField` from the catalog (e.g. "industry",
 *  "estimatedNumEmployees") plus custom-property / signal keys. */
export type CompanyContext = Record<string, unknown>;

// ── Single-criterion evaluation ────────────────────────────────────

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v];
}

/**
 * Normalise a value for case- and separator-insensitive comparison.
 * Apollo returns enum values like "Series A" (space) while a criterion
 * authored by the AI or the rule-builder may store "series_a"
 * (snake_case). Collapsing [\s_-]+ to a single space makes both sides
 * compare equal, so funding stages, seniorities, etc. match regardless
 * of which formatting convention produced them. Applied uniformly to
 * eq / in / contains so the whole engine is separator-resilient.
 */
function norm(v: unknown): string {
  return String(v)
    .trim()
    .toLowerCase()
    // Strip diacritics so the francophone wedge matches: Apollo returns
    // "Ile-de-France" / "Neuchatel" (ASCII) while a criterion is authored
    // "Île-de-France" / "Neuchâtel". Without this, the (required)
    // geography criterion zeroes the fit of every French company.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Apollo writes industries with an ampersand ("information
    // technology & services") while criteria authored by hand / the AI
    // use the word ("...and services"). Equate the two so industry,
    // keyword, etc. comparisons aren't defeated by "&" vs "and".
    .replace(/&/g, " and ")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

/**
 * Evaluate one criterion against a company context. Returns true when
 * the company satisfies the predicate. Unknown field (not in context)
 * is treated as "absent" — only `exists:false` matches an absent field.
 */
export function evaluateCriterion(
  criterion: Criterion,
  ctx: CompanyContext,
): boolean {
  const present = Object.prototype.hasOwnProperty.call(ctx, criterion.fieldKey);
  const raw = present ? ctx[criterion.fieldKey] : undefined;
  const { operator, value } = criterion;

  switch (operator) {
    case "exists": {
      // value true → field must be present and non-empty;
      // value false → field must be absent / empty.
      const isEmpty =
        raw === undefined ||
        raw === null ||
        raw === "" ||
        (Array.isArray(raw) && raw.length === 0);
      return value === false ? isEmpty : !isEmpty;
    }

    case "eq": {
      if (Array.isArray(raw)) return raw.map(norm).includes(norm(value));
      return norm(raw) === norm(value);
    }

    case "in": {
      // company value(s) intersect the criterion's allowed set
      const allowed = new Set(asArray(value).map(norm));
      const have = asArray(raw).map(norm);
      return have.some((h) => allowed.has(h));
    }

    case "contains": {
      // substring match on a text field, OR set-intersection on arrays
      if (Array.isArray(raw)) {
        const needles = asArray(value).map(norm);
        const hay = raw.map(norm);
        return needles.some((n) => hay.some((h) => h.includes(n)));
      }
      return norm(raw).includes(norm(value));
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const n = asNumber(raw);
      const bound = asNumber(value);
      if (n === null || bound === null) return false;
      if (operator === "gt") return n > bound;
      if (operator === "gte") return n >= bound;
      if (operator === "lt") return n < bound;
      return n <= bound;
    }

    case "between": {
      const n = asNumber(raw);
      if (n === null) return false;
      const v = value as { min?: unknown; max?: unknown } | null;
      const min = v ? asNumber(v.min) : null;
      const max = v ? asNumber(v.max) : null;
      if (min !== null && n < min) return false;
      if (max !== null && n > max) return false;
      // between with neither bound set is vacuously false (misconfig)
      return min !== null || max !== null;
    }

    default:
      return false;
  }
}

// ── ICP fit (matrix cell) ──────────────────────────────────────────

export type IcpFitResult = {
  fitScore: number;
  matched: string[];
  unmatched: string[];
  /** criterion id of the required criterion that excluded the company,
   *  or null when not excluded. */
  excludedBy: string | null;
};

/**
 * Compute the fit of one company against one ICP's criteria.
 *
 * Required criteria are hard filters: the first unmatched required
 * criterion sets fitScore=0 and records its id in excludedBy (we still
 * evaluate the rest for explainability). Soft criteria contribute their
 * weight to the numerator when matched; the denominator is the sum of
 * all soft weights. An ICP with only required criteria (no soft) and
 * all matched scores 1.0. An ICP with no criteria at all scores 0
 * (nothing to fit — caller shouldn't persist such an ICP as active).
 */
export function computeIcpFit(
  criteria: Criterion[],
  ctx: CompanyContext,
): IcpFitResult {
  const matched: string[] = [];
  const unmatched: string[] = [];
  let excludedBy: string | null = null;

  let softWeightTotal = 0;
  let softWeightMatched = 0;
  let requiredCount = 0;
  let requiredMatched = 0;

  for (const c of criteria) {
    const ok = evaluateCriterion(c, ctx);
    if (ok) matched.push(c.id);
    else unmatched.push(c.id);

    if (c.isRequired) {
      requiredCount++;
      if (ok) requiredMatched++;
      else if (excludedBy === null) excludedBy = c.id;
    } else {
      softWeightTotal += c.weight;
      if (ok) softWeightMatched += c.weight;
    }
  }

  // Hard filter: any unmatched required criterion zeroes the fit.
  if (excludedBy !== null) {
    return { fitScore: 0, matched, unmatched, excludedBy };
  }

  // No criteria → no fit (degenerate; shouldn't be active).
  if (criteria.length === 0) {
    return { fitScore: 0, matched, unmatched, excludedBy: null };
  }

  // Only required criteria, all matched → perfect fit.
  if (softWeightTotal === 0) {
    return {
      fitScore: requiredCount > 0 && requiredMatched === requiredCount ? 1 : 0,
      matched,
      unmatched,
      excludedBy: null,
    };
  }

  return {
    fitScore: softWeightMatched / softWeightTotal,
    matched,
    unmatched,
    excludedBy: null,
  };
}

// ── Two-level fit (identity vs signal) ─────────────────────────────

/**
 * Firmographic IDENTITY fields a registry (SIRENE / Zefix) populates
 * directly: geography, sector, size. Everything else (technologies,
 * keywords, intent, persona, funding…) is an enrichment SIGNAL the
 * registry does not carry — absence means "not enriched yet", not
 * "doesn't fit".
 */
export const IDENTITY_FIELD_KEYS = new Set<string>([
  "geography", "region", "country", "departement", "state", "city", "location",
  "industry", "sub_industry", "naf", "code_naf", "sector",
  "employee_count", "estimatedNumEmployees", "company_size", "headcount", "revenue",
]);

function hasData(ctx: CompanyContext, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(ctx, key)) return false;
  const v = ctx[key];
  return !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
}

export type IcpFitLevels = IcpFitResult & {
  /** Fit over IDENTITY soft criteria we actually have data for (the
   *  registry layer). A clean registry company that matches its
   *  sector+geo+size scores high here even with zero signals. */
  identityFit: number;
  /** Fit over SIGNAL soft criteria we have data for (0 when unenriched). */
  signalFit: number;
  /** Share of soft-criterion weight we had data to evaluate, [0,1] —
   *  how "backed" the scores are (low = barely enriched). */
  coverage: number;
};

/**
 * Two-level fit. Same hard-filter semantics as computeIcpFit (required
 * criteria still zero everything), but splits the SOFT score into:
 *   - identityFit: matched / total over identity criteria WE HAVE DATA FOR
 *   - signalFit:   matched / total over signal   criteria WE HAVE DATA FOR
 * Criteria whose field is absent from the context are excluded from
 * their level's denominator, so a not-yet-enriched company isn't
 * penalised for missing signals. `coverage` reports how much soft weight
 * was actually evaluable, so a 1.0 identityFit backed by one field can be
 * told apart from one backed by sector+geo+size.
 *
 * The existing `fitScore` (penalising) is preserved on the result so
 * callers can migrate incrementally.
 */
export function computeIcpFitLevels(
  criteria: Criterion[],
  ctx: CompanyContext,
): IcpFitLevels {
  const base = computeIcpFit(criteria, ctx);

  let idTotal = 0, idMatched = 0;
  let sigTotal = 0, sigMatched = 0;
  let softTotal = 0, softWithData = 0;

  for (const c of criteria) {
    if (c.isRequired) continue;
    softTotal += c.weight;
    if (!hasData(ctx, c.fieldKey)) continue; // not enriched → don't penalise
    softWithData += c.weight;
    const ok = evaluateCriterion(c, ctx);
    if (IDENTITY_FIELD_KEYS.has(c.fieldKey)) {
      idTotal += c.weight;
      if (ok) idMatched += c.weight;
    } else {
      sigTotal += c.weight;
      if (ok) sigMatched += c.weight;
    }
  }

  const coverage = softTotal > 0 ? softWithData / softTotal : 1;
  if (base.excludedBy !== null) {
    return { ...base, identityFit: 0, signalFit: 0, coverage };
  }
  return {
    ...base,
    identityFit: idTotal > 0 ? idMatched / idTotal : 0,
    signalFit: sigTotal > 0 ? sigMatched / sigTotal : 0,
    coverage,
  };
}

// ── Blended coverage-aware fit (Phase 0, _specs/icp-unification R2) ──

/** Confidence pricing of the blended score: a perfect fit on partial
 *  data caps at COVERAGE_FLOOR; full coverage releases the rest. */
export const COVERAGE_FLOOR = 0.6;
export const COVERAGE_SPAN = 0.4;

export type BlendedFit = {
  /** The cell score persisted to company_icp_fit.fit_score — [0,1].
   *  fitEvaluable × (COVERAGE_FLOOR + COVERAGE_SPAN × coverage). */
  score01: number;
  /** Σ(w·matched) / Σ(w evaluable) — fit over what we actually know. */
  fitEvaluable: number;
  identityFit: number;
  signalFit: number;
  /** Share of scorable soft weight that was evaluable, [0,1]. */
  coverage: number;
  matched: string[];
  unmatched: string[];
  excludedBy: string | null;
};

/**
 * Phase-0 replacement for the penalizing computeIcpFit in the matrix
 * recompute (_specs/icp-unification R2). Differences:
 *   - a soft criterion whose field is ABSENT from the context leaves
 *     the denominator (no data ≠ no fit) — computeIcpFitLevels
 *     semantics;
 *   - coverage prices the confidence in, so a clean registry company
 *     is never zeroed again for lacking enrichment;
 *   - sourcing-only fields (person_titles, person_seniorities,
 *     hiring_job_titles — never present on a company context) are
 *     ignored entirely: they neither gate, nor score, nor count in
 *     coverage. They remain sourcing/people filters.
 *
 * Required semantics are unchanged from computeIcpFit: an unmatched
 * required criterion zeroes the cell (a must-have we cannot verify is
 * not a fit). Edge cases, locked by tests:
 *   - only required criteria, all matched      → 1.0 (as today)
 *   - soft criteria exist but none evaluable:
 *       required present (and matched)         → COVERAGE_FLOOR
 *       no required                            → 0 (R2.5)
 *   - no scorable criteria at all              → 0
 */
export function computeBlendedFit(
  criteria: Criterion[],
  ctx: CompanyContext,
  sourcingOnly: ReadonlySet<string> = SOURCING_ONLY_FIELD_KEYS,
): BlendedFit {
  const matched: string[] = [];
  const unmatched: string[] = [];
  let excludedBy: string | null = null;

  let requiredCount = 0;
  let softTotal = 0;
  let softWithData = 0;
  let softMatchedW = 0;
  let idTotal = 0,
    idMatched = 0;
  let sigTotal = 0,
    sigMatched = 0;
  let scorable = 0;

  for (const c of criteria) {
    if (sourcingOnly.has(c.fieldKey)) continue;
    scorable++;
    const ok = evaluateCriterion(c, ctx);
    if (ok) matched.push(c.id);
    else unmatched.push(c.id);

    if (c.isRequired) {
      requiredCount++;
      if (!ok && excludedBy === null) excludedBy = c.id;
      continue;
    }
    softTotal += c.weight;
    if (!hasData(ctx, c.fieldKey)) continue; // not enriched → not in the denominator
    softWithData += c.weight;
    if (ok) softMatchedW += c.weight;
    if (IDENTITY_FIELD_KEYS.has(c.fieldKey)) {
      idTotal += c.weight;
      if (ok) idMatched += c.weight;
    } else {
      sigTotal += c.weight;
      if (ok) sigMatched += c.weight;
    }
  }

  const coverage = softTotal > 0 ? softWithData / softTotal : 1;
  const identityFit = idTotal > 0 ? idMatched / idTotal : 0;
  const signalFit = sigTotal > 0 ? sigMatched / sigTotal : 0;

  if (excludedBy !== null) {
    return { score01: 0, fitEvaluable: 0, identityFit: 0, signalFit: 0, coverage, matched, unmatched, excludedBy };
  }
  if (scorable === 0) {
    return { score01: 0, fitEvaluable: 0, identityFit: 0, signalFit: 0, coverage, matched, unmatched, excludedBy: null };
  }

  const fitEvaluable =
    softWithData > 0
      ? softMatchedW / softWithData
      : requiredCount > 0
        ? 1 // every verifiable gate passed, nothing soft to grade
        : 0; // nothing verifiable at all (R2.5)

  const score01 = fitEvaluable * (COVERAGE_FLOOR + COVERAGE_SPAN * coverage);
  return { score01, fitEvaluable, identityFit, signalFit, coverage, matched, unmatched, excludedBy: null };
}

// ── Primary-ICP resolution ─────────────────────────────────────────

export type IcpFitCell = {
  icpId: string;
  priority: number;
  fitScore: number;
};

/**
 * Pick the primary ICP for a company from its row of fit cells. The
 * primary is the ICP the company fits at/above `threshold`, choosing
 * the highest priority (lowest number) on ties of eligibility, then
 * the highest fit. Returns null when nothing clears the threshold —
 * the company is "in the matrix but unowned".
 *
 * This is what feeds the non-breaking `companies.score` mirror: the
 * scalar stays = the primary ICP's fit.
 */
export function resolvePrimaryIcp(
  cells: IcpFitCell[],
  threshold = 0.5,
): IcpFitCell | null {
  const eligible = cells.filter((c) => c.fitScore >= threshold);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) => {
    if (c.priority !== best.priority) return c.priority < best.priority ? c : best;
    return c.fitScore > best.fitScore ? c : best;
  });
}
