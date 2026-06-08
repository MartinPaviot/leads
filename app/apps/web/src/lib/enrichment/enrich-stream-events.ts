/**
 * Enrichment streaming event contract.
 *
 * Single source of truth imported by:
 *   - server : app/api/enrich/stream/route.ts emits these as NDJSON
 *   - client : hooks/use-enrich-stream.ts consumes and reduces over them
 *
 * Mirrors the TAM stream's NDJSON-over-fetch approach (one JSON object
 * per line) so the wire format and client reader are identical. Every
 * event is discriminated on `type`.
 */

import type { CriterionOutcome } from "@/lib/providers/company-enrichment/criteria";
import type { EnrichCompanyStatus } from "./enrich-company-row";

/** Emitted once at the start. Echoes the request so the client can size
 * its progress UI and ignore late events from a cancelled run. */
export interface EnrichHelloEvent {
  type: "hello";
  jobId: string;
  companyIds: string[];
  criteria: string[];
  startedAt: string;
}

/** A company entered the pipeline. The client flips its row to a
 * working state. */
export interface CompanyStartEvent {
  type: "company.start";
  companyId: string;
}

/** A criterion's cell is actively being fetched — render a shimmer.
 * Only emitted for criteria that were *missing* (we don't pretend to
 * search for values that were already present). */
export interface CriterionSearchingEvent {
  type: "criterion.searching";
  companyId: string;
  key: string;
}

/** A criterion finished. `outcome` distinguishes a fresh fill from a
 * pre-existing value from a genuine miss, so the cell never lies. */
export interface CriterionResolvedEvent {
  type: "criterion.resolved";
  companyId: string;
  key: string;
  label: string;
  outcome: CriterionOutcome;
  value: string | null;
}

/** A company finished all its criteria. Drives the row's status dot. */
export interface CompanyDoneEvent {
  type: "company.done";
  companyId: string;
  status: EnrichCompanyStatus;
  provider: string | null;
}

export interface EnrichStreamSummary {
  total: number;
  enriched: number;
  alreadyComplete: number;
  noData: number;
  failed: number;
  durationMs: number;
}

/** Terminal event. */
export interface EnrichDoneEvent {
  type: "done";
  summary: EnrichStreamSummary;
}

/** Soft error for a single company; the run continues with the rest. */
export interface EnrichErrorEvent {
  type: "error";
  companyId?: string;
  message: string;
}

/** Keep-alive every 15s so proxies don't cut an idle connection. */
export interface EnrichHeartbeatEvent {
  type: "heartbeat";
  ts: string;
}

export type EnrichStreamEvent =
  | EnrichHelloEvent
  | CompanyStartEvent
  | CriterionSearchingEvent
  | CriterionResolvedEvent
  | CompanyDoneEvent
  | EnrichDoneEvent
  | EnrichErrorEvent
  | EnrichHeartbeatEvent;

export interface EnrichStreamRequest {
  companyIds: string[];
  /** Criterion keys to fill; omitted → the base set. */
  criteria?: string[];
}
