/**
 * Run-level dedup types (spec 07). The engine is pure over a loaded set; the DB
 * load + re-point of provenance is injected (so it builds off main, decoupled
 * from the parked spec-00 precedence). `pickWinner` is injected = spec-00's
 * provider-precedence resolver.
 */

export interface FieldSource {
  field: string;
  provider: string;
  value: unknown;
  observedAt: Date | string;
}

export interface DedupAccount {
  id: string;
  /** canonicalIdentityKey result (fr:<siren> | ch:<uid> | d:<domain> | n:<name>). */
  identityKey: string | null;
  /** Normalized name for the fuzzy near-match pass. */
  normalizedName: string | null;
  country: string | null;
  /** Per-provider provenance rows for this record. */
  sources: FieldSource[];
}

export interface DedupContact {
  id: string;
  email: string | null;
  linkedinUrl: string | null;
}

/** The precedence winner for a field over its provenance rows (spec-00, injected). */
export type PickWinner = (rows: FieldSource[]) => FieldSource | null;

export interface MergedGroup {
  key: string;
  survivorId: string;
  absorbedIds: string[];
  /** Precedence-resolved canonical fields over the unioned provenance. */
  canonicalFields: Record<string, { value: unknown; provider: string }>;
}

export interface ReviewGroup {
  reason: string;
  ids: string[];
  score: number;
}

export interface ContactGroup {
  survivorId: string;
  absorbedIds: string[];
  by: "email" | "linkedin";
}

export interface MergeReport {
  /** Records absorbed into a survivor (duplicates removed). */
  merged: number;
  /** Records flagged for human review (ambiguous near-match). */
  reviewed: number;
  /** Surviving distinct entities. */
  kept: number;
  groups: MergedGroup[];
  reviews: ReviewGroup[];
  contactGroups: ContactGroup[];
}

export interface DedupOptions {
  /** Name-similarity at/above which a cross-key near-match is flagged for review. */
  reviewThreshold?: number;
}
