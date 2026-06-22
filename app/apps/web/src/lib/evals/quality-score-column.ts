/**
 * P1-12 (Fix 3 / R11) — the shape stored in `outbound_emails.quality_score`
 * (jsonb) and the null-safe mappers around it. Centralised so every draft→outbound
 * writer maps the same way and the nightly back-test reads one canonical shape.
 *
 * We store the COMPOSITE the email was sent at (plus, when available, the split
 * between deterministic substring personalization and the semantic judge, and
 * the framework). The back-test buckets on `composite`; the extra fields are for
 * later analysis only. No email body is stored here (GDPR-safe aggregate path).
 */

export interface QualityScoreColumn {
  /** 0–1 composite the email shipped at. */
  composite: number;
  /** Deterministic (substring) personalization dimension, when known. */
  personalizationDet?: number;
  /** Semantic judge groundedScore (P1-12 2nd stage); null when not run. */
  personalizationSemantic?: number | null;
  /** Outreach framework the email was graded under, when known. */
  framework?: string | null;
}

/**
 * Map a draft/step quality signal to the `quality_score` column. Null-safe:
 * returns null (column stays NULL) when there's no usable composite, so the
 * back-test's `IS NOT NULL` filter naturally excludes ungraded sends.
 */
export function toQualityScoreColumn(
  composite: number | null | undefined,
  extra?: {
    personalizationDet?: number | null;
    personalizationSemantic?: number | null;
    framework?: string | null;
  },
): QualityScoreColumn | null {
  if (composite == null || typeof composite !== "number" || !Number.isFinite(composite)) {
    return null;
  }
  const col: QualityScoreColumn = { composite };
  if (extra?.personalizationDet != null) col.personalizationDet = extra.personalizationDet;
  // `personalizationSemantic` is meaningful even when null (= judge didn't run),
  // so only attach it when the caller explicitly passed the field.
  if (extra && "personalizationSemantic" in extra) {
    col.personalizationSemantic = extra.personalizationSemantic ?? null;
  }
  if (extra?.framework != null) col.framework = extra.framework;
  return col;
}

/**
 * Read the composite back out of a stored `quality_score` value for the
 * back-test. Tolerates the canonical object shape, a legacy bare number, and
 * unparseable junk (→ null, the row is skipped).
 */
export function compositeFromColumn(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "object" && raw !== null && "composite" in raw) {
    const c = (raw as { composite: unknown }).composite;
    return typeof c === "number" && Number.isFinite(c) ? c : null;
  }
  return null;
}
