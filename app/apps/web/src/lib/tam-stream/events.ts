/**
 * TAM streaming event contract.
 *
 * Single source of truth imported by:
 *   - server : app/api/tam/build/route.ts emits these events as NDJSON
 *   - client : hooks/use-tam-stream.ts consumes and reduces over them
 *
 * Every event is discriminated on `type` so TypeScript narrows the
 * payload automatically — callers should never need runtime guards
 * beyond the switch statement.
 */

// ── Signal catalog ────────────────────────────────────────────────
// Kept as a literal union (not string) so exhaustive switches in the
// reducer fail at compile time when a new signal is added.

export type SignalKey =
  | "investor_overlap"
  | "funding_recent"
  | "funding_crunchbase"
  | "hiring_intent"
  | "yc_company";

/** Confidence levels surfaced in the popover. Kept minimal — the
 * stack-ranking logic treats `high` as signal-lit, `medium` as tentative
 * (grey-chip with dotted border), `indeterminate` as inconclusive. */
export type SignalConfidence = "high" | "medium" | "indeterminate";

// ── Shared value objects ──────────────────────────────────────────

export interface Source {
  /** Absolute URL, already HEAD-checked by the server before emission. */
  url: string;
  title: string;
  /** Google s2 favicons URL, falls back to null client-side. */
  favicon?: string;
  /** ISO timestamp of the fetch. Popover shows "Computed 3 days ago". */
  fetchedAt: string;
  /** Server sets false if HEAD check was skipped or failed — the
   * popover groups these under a collapsible "Unverified" section. */
  verified: boolean;
}

export interface CompanyCompact {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  logoUrl: string | null;
  /** Which LLM-generated strategy produced this match. Rendered in the
   * row's provenance tooltip. */
  strategyLabel: string;
}

export interface ContactCompact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  seniority: string | null;
}

export interface WarmPath {
  viaUserId: string;
  viaUserName: string;
  contactId: string;
  contactName: string;
  contactTitle: string | null;
  /** 0..1 — surfaces as a bar in the popover. */
  strength: number;
}

export interface EnrichmentPatch {
  industry?: string | null;
  size?: string | null;
  revenue?: string | null;
  description?: string | null;
  technologies?: string[];
  totalFunding?: number | null;
  totalFundingPrinted?: string | null;
  latestFundingStage?: string | null;
  latestFundingRaisedAt?: string | null;
  foundedYear?: number | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  linkedinUrl?: string | null;
  logoUrl?: string | null;
}

export interface ScorePayload {
  score: number;
  grade: string;
  heat: string;
  reasons: string[];
}

export interface SignalPayload {
  value: boolean;
  reason: string;
  sources: Source[];
  confidence: SignalConfidence;
  computedAt: string;
}

export interface BuildSummary {
  strategiesRun: number;
  companiesFound: number;
  companiesInserted: number;
  companiesSkipped: number;
  aBurningCount: number;
  signalsLit: Record<SignalKey, number>;
  warmPathsFound: number;
  contactsFound: number;
  durationMs: number;
}

// ── Discriminated union of all events ─────────────────────────────

/** Emitted once at the very start. Client uses jobId for telemetry
 * correlation and to ignore late events from a previous cancelled run. */
export interface HelloEvent {
  type: "hello";
  jobId: string;
  tenantId: string;
  startedAt: string;
}

/** LLM-generated strategies. Emitted once after the planner runs.
 * Used client-side to render a "Searching: [Direct fit] [Adjacent]…"
 * row in the progress header. */
export interface StrategyGeneratedEvent {
  type: "strategy.generated";
  strategies: Array<{ label: string; reasoning: string }>;
}

/** Per-page progress within a strategy. Drives the progress bar
 * numerator. Emitted after every Apollo page returns. */
export interface SearchProgressEvent {
  type: "search.progress";
  strategyLabel: string;
  page: number;
  foundSoFar: number;
}

/** A company row exists in DB and is ready to render — score,
 * enrichment, and at least one signal are already resolved. Row
 * animates into the table fully populated. Further signals, contacts,
 * and warm-paths arrive as separate events. */
export interface CompanyInsertedEvent {
  type: "company.inserted";
  company: CompanyCompact;
  /** Enrichment fields that weren't in the CompanyCompact — industry,
   * description, funding, etc. Bundled with the insert so the row
   * renders fully the first time instead of filling in later. */
  enrichment: EnrichmentPatch;
  initialScore: ScorePayload;
  /** First signal to resolve — rendered green/grey immediately.
   * Remaining signals arrive as signal.computed events. null when
   * all signals timed out past the safety window and we emitted the
   * row anyway so the user isn't staring at a stalled builder. */
  initialSignal: { key: SignalKey; payload: SignalPayload } | null;
}

/** Re-score after additional signals have landed. Grade chip
 * transitions (B → A) drive the row's "rise to top" reorder. */
export interface CompanyScoredEvent {
  type: "company.scored";
  companyId: string;
  score: ScorePayload;
}

/** A signal for a specific company finished computing. The chip
 * animates from pending (shimmer) to value (green/grey). */
export interface SignalComputedEvent {
  type: "signal.computed";
  companyId: string;
  key: SignalKey;
  payload: SignalPayload;
}

/** Suggested contacts discovered via Apollo people-search. Expands
 * the row's "+N contacts" badge and prefills the expand panel. */
export interface ContactsFoundEvent {
  type: "contacts.found";
  companyId: string;
  contacts: ContactCompact[];
}

/** Warm-intro paths resolved via the relationships graph. Populates
 * the "Connected to" avatar stack column. */
export interface WarmPathComputedEvent {
  type: "warm_path.computed";
  companyId: string;
  paths: WarmPath[];
}

/** One strategy finished (all pages consumed or page cap hit). Used
 * client-side to dim strategies that are done in the header. */
export interface StrategyCompleteEvent {
  type: "strategy.complete";
  label: string;
  added: number;
  skipped: number;
}

/** Terminal event. Client can surface the reveal banner. */
export interface DoneEvent {
  type: "done";
  summary: BuildSummary;
}

/** Soft error — per-company stage failed. The row keeps whatever
 * state it had; the failed chip shows a "retry" affordance. */
export interface ErrorEvent {
  type: "error";
  companyId?: string;
  stage: string;
  message: string;
  recoverable: boolean;
}

/** Keep-alive emitted every 15s so intermediary proxies
 * (CDN, WAF) don't cut the connection on idle. The client's
 * reducer treats these as no-ops beyond resetting a liveness timer. */
export interface HeartbeatEvent {
  type: "heartbeat";
  ts: string;
}

export type TamEvent =
  | HelloEvent
  | StrategyGeneratedEvent
  | SearchProgressEvent
  | CompanyInsertedEvent
  | CompanyScoredEvent
  | SignalComputedEvent
  | ContactsFoundEvent
  | WarmPathComputedEvent
  | StrategyCompleteEvent
  | DoneEvent
  | ErrorEvent
  | HeartbeatEvent;

// ── Request contract ──────────────────────────────────────────────

export interface BuildRequest {
  /** "new" = build a fresh TAM. "refresh" = recompute signals for
   * existing rows + top up with new Apollo matches. */
  scope?: "new" | "refresh";
  /** Soft cap on companies to insert. Server stops once hit. */
  targetCount?: number;
  /** How many LLM strategies to generate. Clamped server-side to 2..6. */
  strategyCount?: number;
  /** Multi-ICP (Phase 3, _specs/multi-icp). When set, the TAM build
   * sources from THIS ICP's criteria (translated to Apollo params)
   * instead of the LLM planner over the tenant's flat settings. Absent
   * → legacy tenant-wide planner (unchanged). */
  icpId?: string;
  /** UI-driven Apollo facet overrides from the accounts list's
   * sector/geography filters. When present, every sourcing strategy is
   * narrowed to these before hitting Apollo, so "Find more accounts"
   * with a filter active pulls exactly that slice. `industries` are
   * merged into each strategy's keyword tags; `geographies` REPLACE the
   * strategy's own locations. */
  apolloOverrides?: {
    industries?: string[];
    geographies?: string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────

export function emptySignalsLit(): Record<SignalKey, number> {
  return {
    investor_overlap: 0,
    funding_recent: 0,
    funding_crunchbase: 0,
    hiring_intent: 0,
    yc_company: 0,
  };
}

/** Initial summary the handler mutates as events fly. */
export function initSummary(): BuildSummary {
  return {
    strategiesRun: 0,
    companiesFound: 0,
    companiesInserted: 0,
    companiesSkipped: 0,
    aBurningCount: 0,
    signalsLit: emptySignalsLit(),
    warmPathsFound: 0,
    contactsFound: 0,
    durationMs: 0,
  };
}
