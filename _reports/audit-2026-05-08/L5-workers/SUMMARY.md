# L5 Worker dispatch — verdict (PASS on registration ; invocation deferred to L7)

**Run** : 2026-05-08 (audit Phase 5)
**Tooling** : Inngest dev server (binary at
`C:\Users\marti\AppData\Local\npm-cache\_npx\84e0b49cabd4122d\node_modules\inngest-cli\bin\inngest.exe`)
on `:8288`, autodiscovering against the Next dev server's
`/api/inngest` handler on `:3000`.
**Result** : **PASS** on the registration gate — 7 of 7 session-scope
workers are registered with the correct event triggers and (where
applicable) failure handlers wired.

## Why we stopped at registration (didn't invoke events)

The dev server's `DATABASE_URL` resolves to the production Supabase
instance (Frankfurt). Sending real events into that bus would cause
the workers to write live rows : `sequence_drafts` against real
tenants, `visitor_id_charges` ledger entries, `llm_eval_runs`
metrics rows. That's not "testing" — that's "polluting".

Per `requirements.md` §"out-of-scope" the audit declines to run
destructive checks. Registration + trigger metadata is the gate
that *can* be verified safely ; the runtime side-effect verification
moves to **L7 behavioural** where the cron schedules naturally fire
each worker against tomorrow's prod state with a known clock
window.

## Registration verdict — 7 of 7 session-scope workers

Discovered via Inngest dev's autodiscovery against `localhost:3000/api/inngest`.
Full UI table extracted via Playwright `browser_evaluate` — saved
verbatim alongside this summary.

| Audit target | UI label in registry | Trigger | onFailure wired | Verdict |
|---|---|---|---|---|
| F7 `routeSequenceStepToDraft` | "Route Sequence Step → Draft Queue" | `sequence/step-due` | ✓ | **REGISTERED** |
| F7 `cronExpireSequenceDrafts` | "Cron: Expire Pending Sequence Drafts" | `0 * * * *` (hourly) | ✓ | **REGISTERED** |
| F7 `draftRejectionLearner` | "Sequence Draft Rejection Learner" | `draft.rejected` | ✓ | **REGISTERED** |
| F6 `dealPropertyLlmSynthesize` | "Deal property LLM synthesise (why_now / summary)" | `deal/property-llm-synthesize` | ✓ | **REGISTERED** |
| F8 `identifyVisit` | "Identify visitor company (Snitcher / RB2B / Clearbit)" | `visit/created` | — | **REGISTERED** |
| F2 `dailyTranscriptFreshnessAlert` | "Daily transcript-freshness alert" | `TZ=UTC 0 6 * * *` (daily 06:00 UTC) | ✓ | **REGISTERED** |
| F4 `weeklyEvalHarness` | "Weekly LLM eval harness" | `TZ=UTC 0 2 * * 1` (Monday 02:00 UTC) | — | **REGISTERED** |

## Cross-checks against the RUNBOOKs

Each registered trigger was cross-referenced to the RUNBOOK that
ships in `_specs/MONACO-PARITY-P0-{1..5}-RUNBOOK.md` :

- **`Route Sequence Step → Draft Queue`** : RUNBOOK P0-1 says "every
  sequence step that would have sent automatically now generates a
  `sequence_drafts` row in `pending_approval` status (for tenants on
  manual mode)" — registered with trigger `sequence/step-due` matches
  the existing `Send Sequence Step` worker's trigger so both fire on
  the same event ; the router decides via tenant.settings.approvalMode.
- **`Cron: Expire Pending Sequence Drafts`** : RUNBOOK P0-1 says
  "drafts expire after 72h pending without review" — cron fires
  hourly (`0 * * * *`), the worker queries for >72h pending. Hourly
  granularity is correct ; the 72h check is in code, not in the cron.
- **`Sequence Draft Rejection Learner`** : RUNBOOK P0-1 says
  "rejected drafts feed the rejection learner". Trigger
  `draft.rejected` matches.
- **`Deal property LLM synthesise (why_now / summary)`** : RUNBOOK P0-5
  says "deal property cascade triggers LLM synthesis worker for
  why_now and summary fields". Trigger
  `deal/property-llm-synthesize` matches.
- **`Identify visitor company (Snitcher / RB2B / Clearbit)`** :
  RUNBOOK P0-2 says the worker "identifies on `visit/created` event".
  Trigger matches.
- **`Daily transcript-freshness alert`** : RUNBOOK P0-4 says the cron
  fires daily and notifies when bot_status is `degraded` or `silent`.
  Schedule `TZ=UTC 0 6 * * *` = daily at 06:00 UTC matches.
- **`Weekly LLM eval harness`** : Sprint-1 audit follow-up. Schedule
  `TZ=UTC 0 2 * * 1` = Monday 02:00 UTC — matches the design.md
  expectation.

## Bonus observations

1. **App name is "elevay"** — brand is correct in the registered
   metadata (per memory: brand reads "Elevay", not "LeadSens").
2. **Failure-handler auto-creation** : Inngest auto-creates a
   `(failure)` companion function for any worker with an `onFailure`
   handler. Five of the seven workers have one wired :
   `routeSequenceStepToDraft`, `cronExpireSequenceDrafts`,
   `draftRejectionLearner`, `dealPropertyLlmSynthesize`, and
   `dailyTranscriptFreshnessAlert`. Two intentionally don't :
   `identifyVisit` (failures recovered by the Inngest retry policy)
   and `weeklyEvalHarness` (eval errors are surfaced as `casesErrored`
   rows in `llm_eval_runs`, not as worker failures).
3. **All workers point at the same handler URL** — no rogue worker
   leaked from a different file.
4. **87 functions registered total** — substantial existing surface
   ; the 7 session-scope additions slot in cleanly without breaking
   any prior wiring.

## Edge cases pinned by L5

From `requirements.md` §"edge cases the audit must catch" :

> 2. **Worker registered but never fires** (event topic typo,
>    Inngest dashboard mismatch).
>    → L5 manually triggers each new event topic.

L5 covers half of this : we verified the trigger string in the
registry exactly matches the trigger string in the RUNBOOK. A typo
between the worker file's `triggers: [{ event: "..." }]` declaration
and the producer code that emits the event is **not** caught here —
that requires L6 prod smoke (the producer fires, the worker
processes, the side effect lands). Documented as L7 behavioural
follow-up.

## Score adjustments

| F# | Before L5 | After L5 |
|---|---|---|
| F2 freshness alert worker | 0.85 (RUNBOOK says it'll fire) | **0.90** — registered + scheduled correctly |
| F4 weekly eval harness | 0.85 | **0.90** — registered + Monday 02:00 UTC confirmed |
| F6 deal property cascade | 0.95 (post-L4) | **0.95** — schema + worker registered |
| F7 sequence drafts cluster | 0.95 | **0.97** — 3 workers + 2 onFailure auto-wired |
| F8 visitor-id worker | 0.95 | **0.97** — registered, schema confirmed |

## Evidence files

- `_reports/audit-2026-05-08/L5-workers/inngest-registry.png` — full-page screenshot of all 87 registered functions
- `_reports/audit-2026-05-08/L5-workers/registry-extract.json` — canonical JSON of the 7 session-scope workers
- `_reports/audit-2026-05-08/L5-workers/inngest-put.json` — the dev server's `PUT /api/inngest` response (registers against Inngest cloud — fails in dev as expected, for record)

## Cleanup

```bash
taskkill //PID 19820 //F        # inngest dev (autodiscovery)
taskkill //PID 1248 //F         # next dev
```

Cleanup deferred to end of audit so subsequent layers (L6 if you
push the deploy preview) can attach.

## Time

L5 active time : ~25 min including npx EPERM workaround (resolved
by running the cached `inngest.exe` binary directly). Within the
60-min budget.

## Next layer

L6 (production smoke) — still blocked on Vercel deploy preview
push. Suggest pushing now : L1+L2+L4+L5 are all green ; L3 partial
already covers anonymous PostHog + CSP ; the auth-gated L3 portion
overlaps L6 anyway.

L7 (behavioural over time) — naturally takes the next 7 days.
