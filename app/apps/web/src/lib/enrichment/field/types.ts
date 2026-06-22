/**
 * Field-level waterfall enrichment contract (spec 08). A NEW field-level path
 * (confidence ÷ cost ordering, per-field cache + TTL) beside the existing
 * whole-record waterfall. Providers, cache, meter, and the provenance write are
 * injected, so it builds off main decoupled from the parked spec-00/02.
 */

export interface FieldCacheEntry {
  value: unknown;
  provider: string;
  confidence: number;
  costCredits: number;
  ttlExpiresAt: Date;
}

export type FieldStatus = "filled" | "cached" | "unknown" | "budget-exhausted";

export interface FieldResult {
  field: string;
  value?: unknown;
  provider?: string;
  confidence?: number;
  costCredits?: number;
  ttlExpiresAt?: Date;
  fromCache?: boolean;
  status: FieldStatus;
}

export interface FieldProvider {
  name: string;
  /** Credits per field call (0 = free, e.g. registry). */
  cost: number;
  supports(field: string): boolean;
  /** Expected confidence in [0,1] for ordering by (confidence ÷ cost). */
  expectedConfidence(field: string): number;
  /** Fetch the field; null if the provider can't supply it. */
  fetchField(accountId: string, field: string): Promise<{ value: unknown; confidence: number } | null>;
}

export interface FieldCache {
  /** Return the entry only if still within TTL, else null. */
  get(accountId: string, field: string): Promise<FieldCacheEntry | null>;
  set(accountId: string, field: string, entry: FieldCacheEntry): Promise<void>;
}

export interface MeterOp {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

export interface EnrichDeps {
  tenantId: string;
  providers: FieldProvider[];
  cache: FieldCache;
  /** spec-02 metering (AC4 budget enforced via the wrapped call). */
  meter<R>(op: MeterOp, fn: () => Promise<R>): Promise<R>;
  /** spec-00 provenance write (AC3). */
  persist?(accountId: string, field: string, entry: FieldCacheEntry): Promise<void>;
  /** False when the segment budget is exhausted (AC4); checked before each call. */
  budgetOk?(): Promise<boolean> | boolean;
  /** Per-field confidence threshold (default 0.6). */
  threshold?(field: string): number;
  now?(): number;
}
