# MONACO-PARITY P0-3 — Onboarding Wizard RUNBOOK

Operational manual for the 7-phase onboarding wizard. Linked from
the wizard footer copy and from the PostHog funnel description.

## What the system does

A new tenant lands at `/onboarding-v3` and the wizard walks them
through seven phases — Diagnostic, ICP & TAM, Email & Calendar,
Signals, Voice & Sequences, Pipeline, Coaching. Each phase has a
Zod-validated payload + a hard checklist gate. The founder cannot
finalise until every required gate passes — copying form values
client-side cannot bluff completion since gates query DB state
directly.

## Core invariants

- Only the server's `evaluateOnboardingChecklist()` decides whether
  finalise is allowed. The UI mirrors the result but never ships
  the source of truth.
- Phase nav respects `canNavigateToPhase` (revisit completed +
  current phases ; never jump ahead).
- Validation failures surface immediately and never auto-retry —
  retry is reserved for transient 5xx / 429 / network errors.
- Telemetry fires from BOTH server (state changes) and client
  (mount, phase submit, completion attempt) with shared event names
  so the funnel merges cleanly.

## Data flow

```
GET /api/onboarding/state ──────────────────────────────┐
   │                                                    │
   ▼                                                    │
OnboardingWizard mounts                                 │
   │                                                    │
   ▼                                                    │
   trackWizardOpened (started or resumed)               │
   │                                                    │
   ▼                                                    │
PhaseStepper + PhaseBody render                         │
   │                                                    │
   ▼                                                    │
User fills Phase N, submits ───→ POST /api/onboarding/phase/N
   │                                                    │
   ▼                                                    │
   Zod validate + persist + advance currentPhase        │
   │                                                    │
   ▼                                                    │
   trackPhaseSubmitted(success/failure, durationMs)     │
   │                                                    │
   └──── refreshState ──────────────────────────────────┘
   ...
   loop until activePhase === 7 + completedPhases.includes(7)
                                  + checklist.allHardPassed
   │
   ▼
finalise button visible (canFinalize predicate)
   │
   ▼
POST /api/onboarding/complete
   │
   ▼
   Re-evaluate gates, mark `completedAt`
   │
   ▼
   trackCompletionAttempt(success, durationMs)
   │
   ▼
   router.replace("/home")
```

## Key files

| Concern | File |
|---|---|
| Wizard component | `components/onboarding-7phase/wizard.tsx` |
| Mount route | `app/(dashboard)/onboarding-v3/page.tsx` |
| API : state | `app/api/onboarding/state/route.ts` |
| API : phase submit | `app/api/onboarding/phase/[n]/route.ts` |
| API : complete | `app/api/onboarding/complete/route.ts` |
| Checklist gates | `lib/onboarding/checklist.ts` |
| Phase Zod schemas | `lib/onboarding/phase-validators.ts` |
| Vertical playbooks | `lib/onboarding/playbooks.ts` |
| Resume / nav helpers | `lib/onboarding/resume.ts` |
| Retry policy | `lib/onboarding/retry.ts` |
| Telemetry helpers | `lib/analytics/onboarding-telemetry.ts` |

## Hard checklist gates

Defined in `lib/onboarding/checklist.ts` — every required gate must
pass before `/api/onboarding/complete` flips the row to `completedAt`.

| Key | Definition | Threshold |
|---|---|---|
| `tam_size` | accounts in tenant | ≥ 30 |
| `tam_relevance` | A-grade accounts (score ≥ 80) | ≥ 3 |
| `email_sync` | email activities in last 7 days | ≥ 10 |
| `calendar_sync` | meeting activities in last 7 days | ≥ 1 |
| `custom_signals` | custom signal rows | ≥ 3 |
| `active_sequence` | sequences in `active` status | ≥ 1 |
| `pipeline_stages` | (soft) deals in tenant | ≥ 0 |
| `coaching_query` | rows in `chat_messages` | ≥ 1 |
| `contact_present` | contacts in tenant | ≥ 1 |

A failing gate surfaces in the right-rail checklist sidebar with a
human-readable reason.

## Telemetry events

All client-side events fire through `trackEvent()` in
`components/posthog-provider.tsx`, mirroring the server-side
catalog in `lib/analytics/analytics.ts`.

| Event | Where | Properties |
|---|---|---|
| `onboarding_started` | wizard mount, fresh tenant | userId, tenantId |
| `onboarding_resumed` | wizard mount, returning tenant | fromStep, tenantId |
| `onboarding_v3_phase_submitted` | per-phase submit | phase, success, validationErrors, durationMs, durationSinceStartMs |
| `onboarding_v3_completed` | finalise click | success, failingGatesCount, durationMs |
| `onboarding_v3_founder_led_clicked` | upsell CTA | source |

Funnel query (PostHog) :
```
onboarding_started → phase 1 submit (success=true) → phase 2 submit
... → onboarding_v3_completed (success=true)
```

## Retry policy

`lib/onboarding/retry.ts` :
- Max 3 attempts per network call.
- Exponential backoff with full jitter, capped at 4 seconds.
- 5xx + 429 + network → retry.
- 4xx with `issues` array (Zod) → terminal, surface immediately.
- 4xx without `issues` (auth, 404) → terminal.

## Alarms & on-call playbook

### Per-phase drop-off > 50% (PostHog funnel)

A specific phase is bleeding users. Standard pattern :
- Phase 1 drop-off → ICP form is too long / unclear.
- Phase 3 drop-off → OAuth connection failed silently. Check
  `signin_failed` event for the period.
- Phase 5 drop-off → Voice capture is asking too much (5 emails).
  Check whether Loom URL alternative is being used.

**Investigate**
1. Pull `onboarding_v3_phase_submitted{success=false}` count by
   phase + validationErrors histogram.
2. Sample 5 abandoned tenants — pull their phase progress from
   `onboarding_progress` table.

**Fix path**
- Validation errors clustered → tighten the form's pre-submit
  validation hints.
- No errors but high drop-off → the phase is too cognitively
  expensive. Consider splitting it.

### `onboarding_v3_completed` success rate < 60%

Tenants are bouncing on the finalise button. Likely cause : a hard
gate is failing late (e.g. user can complete phases 1-7 with the UI
but `email_sync` count comes up short of 10).

**Investigate**
1. Pull `onboarding_v3_completed{success=false}` and inspect
   `failingGatesCount` distribution. Common bins :
   - 1 failing → one specific gate ; check which.
   - 3+ failing → setup is fundamentally incomplete (likely
     OAuth disconnected mid-flow).
2. Cross-reference with email/calendar OAuth tokens (`auth_accounts`
   table) — has the founder revoked access ?

**Fix path**
- Surface failing gates in the wizard EARLIER (currently only
  visible in the right rail) — add inline warnings on phases 3 + 4
  if the gate they unlock is failing.
- Retry email sync via the bottom-of-page button (already in
  Settings → Mail & Calendar).

### Wizard error fallback shown frequently

`onboarding_api_latency{status=-1}` spike + first-render error
fallback is firing → a network-level outage is keeping `/api/onboarding/state`
unreachable.

**Investigate** — Inngest worker health for the API. Datadog APM
trace for `/api/onboarding/state`. Database connection pool
saturation.

## Manual operations

### Reset a tenant's onboarding (re-run from phase 1)

```sql
UPDATE onboarding_progress
SET current_phase = 1,
    completed_phases = '[]'::jsonb,
    phase_data = '{}'::jsonb,
    completed_at = NULL
WHERE tenant_id = '...';
```

### Force-complete a tenant (bypass gates)

Should be rare — usually only for sandbox / demo tenants where the
underlying data is intentionally minimal.

```sql
UPDATE onboarding_progress
SET completed_at = NOW(),
    current_phase = 7,
    completed_phases = '[1,2,3,4,5,6,7]'::jsonb
WHERE tenant_id = '...';
```

⚠️ This bypasses every hard gate. Only do it for tenants where you
know the data won't drive autopilot decisions (demo accounts, etc.).

### Audit which tenants are stuck on a specific phase

```sql
SELECT current_phase, COUNT(*) AS stuck_count
FROM onboarding_progress
WHERE completed_at IS NULL
  AND started_at < NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 2 DESC;
```

## Test coverage map

| Concern | Test |
|---|---|
| Telemetry helpers | `__tests__/onboarding-telemetry.test.ts` (15) |
| Retry policy | `__tests__/onboarding-retry.test.ts` (18) |
| Resume / nav / finalize | `__tests__/onboarding-resume.test.ts` (15) |
| Wizard component | `components/__tests__/onboarding-wizard.test.tsx` (10) |
| Existing playbook lib | `__tests__/onboarding-playbooks.test.ts` (~10) |
| Existing checklist gates | server-side via API integration |

Total : 58+ tests covering this feature.

## Open issues / future work

- Per-tenant onboarding velocity dashboard — surface time-to-
  complete distributions broken down by tenant size + industry.
  Useful for the eventual onboarding optimization sprint.
- Mid-phase autosave — currently the user fills a phase and only
  the submit persists. A flaky tab refresh loses input. Local-
  storage draft would fix this without DB changes.
- Phase 5 voice capture : the "paste 5 emails" friction is the
  highest drop-off in pilot data. The Loom alternative helps but
  isn't surfaced until the user has typed something. Re-order to
  show both options upfront.
- A/B test : pre-fill ICP from the user's email domain instead of
  asking from blank. Many founders' company domain → industry +
  size mapping is high-signal.

_Last updated_ : 2026-05-07
