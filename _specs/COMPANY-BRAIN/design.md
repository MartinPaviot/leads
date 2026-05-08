# Company Brain — design

## Phase 1 — pure read aggregation (this commit)

**Files added** :

```
app/apps/web/src/lib/company-brain/
  types.ts          — CompanyBrain interface + per-layer types
  get-brain.ts      — getCompanyBrain(companyId, opts, deps?)
  freshness.ts      — pure helper that derives layer freshness
                       timestamps from the loaded data
  __tests__/
    get-brain.test.ts        — multi-tenant + cap + missing layer
    freshness.test.ts        — pure unit tests
app/apps/web/src/app/api/brain/[companyId]/route.ts
                    — GET handler, admin or company-scoped access
```

**Files NOT touched** :
- `db/schema/*` — zero schema changes
- `inngest/*` — no new workers
- existing chat / dashboard routes — Phase 3 wires them

## `CompanyBrain` shape

```ts
export interface CompanyBrain {
  company: {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    sizeBand: string | null;
    score: number | null;
    createdAt: Date;
  };
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    isChampion: boolean;     // derived from context graph edges
    intentScore: number | null;
    intentTrend: "heating" | "stable" | "cooling" | null;
    lastTouchAt: Date | null;
  }>;
  deals: Array<{
    id: string;
    name: string;
    stage: string;
    value: number | null;
    expectedCloseDate: Date | null;
    properties: Record<string, {
      value: unknown;
      source: string;
      date: Date | null;
      manual: boolean;
      confidence: number | null;
    }>;
    riskLevel: "low" | "medium" | "high" | "none" | null;
    riskReasons: string[];
    stallProbability: number | null;
    stallIndicators: Array<{
      type: string;
      severity: "high" | "medium" | "low";
      detail: string;
      evidence?: string[];
    }>;
  }>;
  activities: Array<{
    id: string;
    type: string;
    direction: "inbound" | "outbound" | "internal";
    occurredAt: Date;
    summary: string | null;
    entityType: string | null;
    entityId: string | null;
  }>;
  signals: Array<{
    id: string;
    type: string;
    title: string;
    detectedAt: Date;
    confidence: number | null;
    sourceUrl: string | null;
  }>;
  meetings: Array<{
    id: string;
    title: string;
    occurredAt: Date;
    transcriptChunkCount: number;
    recordingUrl: string | null;
  }>;
  // top-N most semantically relevant chunks, when opts.transcriptQuery
  transcriptChunks?: Array<{
    meetingId: string;
    startSec: number;
    speaker: string | null;
    text: string;
    score: number;
  }>;
  knowledgeEntries: Array<{
    id: string;
    title: string;
    body: string;
    scope: string;
  }>;
  contextGraphEdges: Array<{
    sourceId: string;
    targetId: string;
    relationType: string;
    fact: string;
    confidence: number | null;
  }>;
  dossier: import("@/lib/research/dossier-builder").Dossier | null;
  freshness: {
    company: Date | null;
    contacts: Date | null;
    deals: Date | null;
    activities: Date | null;
    signals: Date | null;
    meetings: Date | null;
    transcriptChunks: Date | null;
    knowledgeEntries: Date | null;
    contextGraphEdges: Date | null;
    dossier: Date | null;
  };
  truncated: {
    activities: boolean;
    signals: boolean;
    contacts: boolean;
  };
}

export interface GetCompanyBrainOpts {
  tenantId: string;     // multi-tenant filter — REQUIRED, never optional
  recentActivityCap?: number;       // default 50
  recentSignalCap?: number;         // default 20
  contactCap?: number;              // default 50
  includeStaleSignals?: boolean;    // default false
  includeDossier?: boolean;         // default true
  transcriptQuery?: string;         // when set, fetches top-8 chunks
                                     //  semantically relevant
}
```

## Query strategy

`getCompanyBrain` runs **8 parallel queries** in a single
`Promise.all`. No N+1, no nested awaits :

1. `db.select(companies).where(...).limit(1)` — base
2. `db.select(contacts).where(companyId, tenantId).limit(cap)` — contacts
3. `db.select(deals).where(companyId, tenantId)` — deals (small, no cap)
4. `db.select(activities).where(...).orderBy(occurredAt desc).limit(cap)` — activities
5. `db.select(signals).where(...).limit(cap)` — signals
6. `db.select(meetings).where(...).orderBy(occurredAt desc)` — meetings (small)
7. `db.select(knowledgeEntries).where(scope, tenantId).limit(cap)` — knowledge
8. `db.select(contextGraphEdges).where(sourceId, tenantId)` — relations

Plus optional :
- `loadDossier(companyId)` — only when `includeDossier`
- `retrieveTranscriptChunks(...)` — only when `transcriptQuery` is
  set (the helper exists, embed the query, top-N chunks)

Per-deal stall predictions are loaded in a 9th batch query that
calls into existing `predictStalls` once and zip-merges results
into the deals[] entries. Single `predictStalls` call covers all
deals for the tenant ; we filter to companyId in code.

## Freshness derivation

```ts
freshness.activities = max(activity.occurredAt) || null;
freshness.signals = max(signal.detectedAt) || null;
freshness.dossier = dossier?.builtAt || null;
// etc.
```

Pure function, deterministic, exported separately for unit
testability.

## Multi-tenant guarantees

Every `where()` clause includes `eq(<table>.tenantId,
opts.tenantId)`. The function refuses to run if `opts.tenantId` is
falsy (throws). The route handler resolves `tenantId` from
`getAuthContext()` and passes it ; **the route never accepts a
caller-provided tenantId**.

If the company's `tenantId` ≠ `opts.tenantId`, returns `null`. The
route handler then 404s.

## Test plan

`get-brain.test.ts` :
- happy path : company + 2 contacts + 1 deal + 5 activities → all
  fields populated
- multi-tenant filter : company in tenant A, query with tenant B →
  null
- truncation : > cap activities → returned cap, `truncated.activities: true`
- missing dossier : `includeDossier: false` → `dossier: null`
- missing transcript chunks : no `transcriptQuery` → no
  `transcriptChunks` field
- empty case : company with zero everything → empty arrays, no throw

`freshness.test.ts` :
- activities sorted desc → `freshness.activities` = first
- empty layer → null
- mixed null + dates → null entries skipped

## Phase 2 (NOT in this commit) — sketch only

Trigger : when Phase 1 read latency > 200ms p95 OR when chat panel
hits getCompanyBrain on every message and observed cost dominates.

Add `entity_brain_snapshots` table :
```sql
CREATE TABLE entity_brain_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  brain_json jsonb NOT NULL,
  source_layers_freshness jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now(),
  ttl_seconds integer NOT NULL DEFAULT 600,
  UNIQUE (tenant_id, entity_type, entity_id)
);
```

Inngest worker `materialiseEntityBrain` runs on demand or on
event `brain/refresh-requested`. The read API checks the cache
first, falls back to live aggregation if stale or missing.

## Phase 3 (NOT in this commit) — sketch only

UI surface : `/accounts/[id]` already exists. Add a "Brain"
section above the existing tabs that consumes `getCompanyBrain`
and renders 4-5 collapsible blocks (deals state, recent
activities, signals, dossier, citations from transcripts).

Chat tool : add `getCompanyBrainTool` to the chat tool registry
so when the user asks "what do we know about AcmeCorp", the LLM
calls the tool instead of the current ad-hoc context assembly.

## What this commit ships and what it doesn't

Ships :
- Read API + types
- Route
- Tests

Doesn't ship :
- Schema changes
- UI changes
- Chat integration
- Cache layer

Reason : minimum viable proof-of-concept that the brain *can be
read in one query* with the right shape. If the shape feels right,
Phases 2-3 commit to it. If not, the type still composes by
hand-assembly without lock-in.
