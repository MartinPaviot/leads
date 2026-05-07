# MONACO-PARITY-03 — Design

## System fit
We have `components/onboarding-wizard.tsx` (the existing chat-based onboarding) and `components/onboarding-v2-wrapper.tsx`. We are replacing/refactoring the wizard to enforce 7 distinct phases with hard validation gates instead of a free-form chat.

State is persisted in a new `onboarding_progress` table so a session can resume across browser closes.

## Data model

### New table: `onboarding_progress`
```
id              text primary key
tenantId        text references tenants(id) unique  -- one row per tenant
currentPhase    int not null default 1               -- 1..7
completedPhases int[] not null default '{}'
phaseData       jsonb not null default '{}'          -- per-phase user input
checklistState  jsonb not null default '{}'          -- mirror of the gate checklist
startedAt       timestamptz default now()
completedAt     timestamptz
updatedAt       timestamptz default now()
```

### Extend `tenants` (or settings)
- `voiceProfile jsonb` — captured tone-of-voice extraction.
- `icpConfidence numeric(3,2)` — set by Phase 2 validator.

## API contracts

### `GET /api/onboarding/state`
Returns current phase + completedPhases + checklistState. Front-end resumes from this.

### `POST /api/onboarding/phase/:n`
Validates the phase-N payload, runs the gate, returns `{ ok: true, nextPhase }` or `{ ok: false, errors: [...] }`.

Per-phase payload schemas live in `lib/onboarding/schemas.ts` — Zod.

### `POST /api/onboarding/complete`
Final commit. Verifies ALL hard checklist items pass. Idempotent.

## Phase implementations

Each phase is a React server-or-client component under `app/(onboarding)/onboarding/[phase]/page.tsx`. Phase router enforces order: cannot navigate to Phase N if `completedPhases.length < N - 1`.

Phase 2 (TAM) reuses `lib/tam/build.ts` + the existing NDJSON streaming. The validation gate is a new endpoint `POST /api/onboarding/phase/2/validate` that checks the user has marked relevance on ≥ 3 A-grade accounts via the existing `account_grades` table.

Phase 5 (Voice) calls a new `lib/voice/extract-tone.ts` that LLM-classifies 5 emails into the four-axis profile.

## Failure handling
- Per-phase POST 4xx → render inline error with remediation.
- LLM extraction fails → soft skip with warning; never block on a soft gate.
- OAuth callback errors → reuse existing `auth-callback.ts` `OAuthUnavailable` handling.
- DB constraint violations → return 500 with structured error code.

## Security
- The wizard never reads from third-party APIs without explicit user OAuth grant.
- All persistence is `tenantId`-scoped; `onboarding_progress` queries enforce `where tenant_id = $auth.tenant_id`.
