/**
 * Sprint audience — the PURE slice of the call-sprint module (type +
 * targetFilter parser), dependency-free so client components (cockpit chip)
 * and server code share one SSOT. Resolution/SQL live in
 * lib/voice/call-sprint.ts, which re-exports these.
 *
 * This shape is also the per-list SEGMENT (call-lists, _specs/call-lists):
 * a sector list stores one of these on its definition, and the ACTIVE list's
 * segment is mirrored onto callCampaigns.targetFilter.audience so the daily
 * top-up draws from it. The two original facets (industries × personas) are
 * the sprint; the optional facets below are the additional R4 segmentation
 * parameters, AND-combined.
 *
 * Wired in v1 (direct, stored-column conditions — see sprintAudienceConditions):
 *   industries, personas, signals, phoneType, fitMin, freshnessDays, dealValueMin.
 * v2 seams (need a derivation/mapping, deliberately NOT wired yet so a half-
 * right condition can't silently match the wrong rows — the jsonb footgun):
 *   - seniority: no stored tier column today (title palier is display-derived)
 *   - accountStage: derived at read time from deals (lib/accounts/lifecycle-stage)
 *   - companySize: companies.size is a free-text band, needs a parse/mapping
 *   - replaceableTech: needs lib/tech-detect/replaceable over the stored stack
 *   - owner/source/geo: need a current-user param / provider-name mapping
 */

export interface SprintAudience {
  /** Human label echoed in chat/UI ("les DG des EMS romands"). */
  label: string;
  /** Verbatim companies.industry labels (subset of the tenant's real ones). */
  industries: string[];
  /** Verbatim persona labels (subset of the active ICPs' person_titles). */
  personas: string[];
  /** R4.4 — contacts.properties.latestSignal.type ∈ signals (buying-signal facet). */
  signals?: string[];
  /** R4.14 — contacts.properties.phoneType ∈ phoneType (mobile|direct|switchboard). */
  phoneType?: string[];
  /** R4.13 — contacts.score >= fitMin (ICP fit floor, 0..100). */
  fitMin?: number;
  /** R4.12 — contacts.last_enriched_at within the last freshnessDays days. */
  freshnessDays?: number;
  /** R4.6 — has a live linked deal worth >= dealValueMin. */
  dealValueMin?: number;
}

/**
 * Validate a campaign targetFilter's `audience` into a usable SprintAudience.
 * Null when absent, malformed, or empty on EVERY facet — an empty audience
 * must mean "no sprint" (whole ICP), never silently "match everyone". A
 * segment carrying only an extended facet (e.g. fitMin alone) is valid.
 */
export function readSprintAudience(targetFilter: unknown): SprintAudience | null {
  if (!targetFilter || typeof targetFilter !== "object") return null;
  const raw = (targetFilter as Record<string, unknown>).audience;
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const strs = (v: unknown) =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))]
      : [];
  // A facet number is kept only when finite and non-negative; anything else
  // (NaN, "x", -1) is dropped so a malformed value never becomes a filter.
  const posNum = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

  const industries = strs(a.industries);
  const personas = strs(a.personas);
  const signals = strs(a.signals);
  const phoneType = strs(a.phoneType);
  const fitMin = posNum(a.fitMin);
  const freshnessDays = posNum(a.freshnessDays);
  const dealValueMin = posNum(a.dealValueMin);

  const empty =
    industries.length === 0 &&
    personas.length === 0 &&
    signals.length === 0 &&
    phoneType.length === 0 &&
    fitMin === undefined &&
    freshnessDays === undefined &&
    dealValueMin === undefined;
  if (empty) return null;

  const label = typeof a.label === "string" && a.label.trim() ? a.label.trim() : "sprint";
  // Keep the original two facets always present (backward-compatible shape);
  // add the optional facets only when set, so a sprint-only audience is byte-
  // identical to before.
  const out: SprintAudience = { label, industries, personas };
  if (signals.length > 0) out.signals = signals;
  if (phoneType.length > 0) out.phoneType = phoneType;
  if (fitMin !== undefined) out.fitMin = fitMin;
  if (freshnessDays !== undefined) out.freshnessDays = freshnessDays;
  if (dealValueMin !== undefined) out.dealValueMin = dealValueMin;
  return out;
}
