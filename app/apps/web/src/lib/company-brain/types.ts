/**
 * Company Brain — Phase 1 read-aggregation types.
 *
 * The Brain is the unified, cited, freshness-tagged view of every
 * artifact + every derived property the system has accumulated for
 * a single company. Phase 1 = read API only ; no schema changes.
 *
 * Each layer reports its own freshness so a consumer (chat panel,
 * meeting prep, founder briefing) can decide whether to wait for
 * a refresh or proceed on stale data.
 */

import type { Dossier } from "@/lib/research/dossier-builder";

export interface CompanyBrainCompany {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeBand: string | null;
  score: number | null;
  createdAt: Date;
}

export interface CompanyBrainContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  /** Derived from contextGraphEdges where relationType='champion'. */
  isChampion: boolean;
  /** Last `scoreBuyerIntent` snapshot, when available. */
  intentScore: number | null;
  intentTrend: "heating" | "stable" | "cooling" | null;
  lastTouchAt: Date | null;
}

export interface DealPropertyMetadata {
  value: unknown;
  source: string;
  date: Date | null;
  manual: boolean;
  confidence: number | null;
}

export interface CompanyBrainDeal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  expectedCloseDate: Date | null;
  /** Property cell metadata, citation-shaped — see deal-autofill
   *  spec for the {value, source, date, manual, confidence} contract. */
  properties: Record<string, DealPropertyMetadata>;
  riskLevel: "low" | "medium" | "high" | "none" | null;
  riskReasons: string[];
  /** Hydrated from `predictStalls` output when the deal is among
   *  predictions. null if stall prediction wasn't run. */
  stallProbability: number | null;
  stallIndicators: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    detail: string;
    evidence?: string[];
  }>;
}

export interface CompanyBrainActivity {
  id: string;
  type: string;
  direction: string | null;
  occurredAt: Date;
  summary: string | null;
  entityType: string | null;
  entityId: string | null;
}

export interface CompanyBrainMeeting {
  /** Activity row id where activityType in {meeting_completed,
   *  meeting_scheduled}. */
  id: string;
  title: string;
  occurredAt: Date;
  /** Number of `transcript_chunks` rows tied to this meeting id. */
  transcriptChunkCount: number;
}

export interface CompanyBrainTranscriptChunk {
  meetingId: string;
  startSec: number;
  speaker: string | null;
  text: string;
  /** Cosine similarity vs `opts.transcriptQuery` embedding. 0..1. */
  score: number;
}

export interface CompanyBrainKnowledgeEntry {
  id: string;
  title: string;
  body: string;
  scope: string;
}

export interface CompanyBrainContextEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  fact: string;
  confidence: number | null;
}

export interface CompanyBrainMemory {
  id: string;
  scope: string;
  content: string;
  createdAt: Date;
}

export interface CompanyBrainFreshness {
  company: Date | null;
  contacts: Date | null;
  deals: Date | null;
  activities: Date | null;
  meetings: Date | null;
  transcriptChunks: Date | null;
  knowledgeEntries: Date | null;
  contextGraphEdges: Date | null;
  memories: Date | null;
  dossier: Date | null;
}

export interface CompanyBrainTruncated {
  activities: boolean;
  contacts: boolean;
  memories: boolean;
}

export interface CompanyBrain {
  company: CompanyBrainCompany;
  contacts: CompanyBrainContact[];
  deals: CompanyBrainDeal[];
  activities: CompanyBrainActivity[];
  meetings: CompanyBrainMeeting[];
  /** Only populated when `opts.transcriptQuery` is set. */
  transcriptChunks?: CompanyBrainTranscriptChunk[];
  knowledgeEntries: CompanyBrainKnowledgeEntry[];
  contextGraphEdges: CompanyBrainContextEdge[];
  memories: CompanyBrainMemory[];
  /** Only populated when `opts.includeDossier` (default true). */
  dossier: Dossier | null;
  freshness: CompanyBrainFreshness;
  truncated: CompanyBrainTruncated;
}

export interface GetCompanyBrainOpts {
  /** REQUIRED — filter every join by tenantId. Never optional ;
   *  callers MUST pass authCtx.tenantId, never a user-supplied
   *  value. */
  tenantId: string;
  recentActivityCap?: number;
  contactCap?: number;
  memoryCap?: number;
  includeDossier?: boolean;
  /** When set, fetches the top-8 transcript chunks semantically
   *  closest to this query across all meetings tied to this
   *  company's contacts. */
  transcriptQuery?: string;
}
