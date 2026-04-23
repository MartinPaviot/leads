# Retroactive spec: Custom signals

## Status
- Shipped in: `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21. Bug fixes in `d457f0a` (direct-to-main), 2026-04-21.
- Spec written: 2026-04-22
- Reviewed by Martin: pending

## Purpose
Lets a founder define arbitrary boolean signals ("Has public API", "Uses Segment", "SOC 2 certified") that are automatically detected across every company in their TAM. The system generates a three-tier detection plan via LLM and backfills it over existing companies — no manual tagging, no predefined signal catalog. Surfaces as columns in the accounts table with per-company chips.

## Current behavior

### Signal creation flow
- **UI:** `/settings/signals` page — list of existing signals + inline create form (name + description). Polls every 5s while any signal is backfilling.
- **API:** `POST /api/custom-signals` creates the DB row, generates the detection plan via LLM, and dispatches an Inngest backfill.
- **Auth:** any authenticated tenant member (admin gate removed, approved 2026-04-22 — see route.ts header comment for rationale and enforcement chain).
- **Rate limit:** `checkRateLimit("llm", userId)` per-user burst protection.
- **Duplicate guard:** unique check on `(tenantId, name)` before insert. Returns 409 on collision.
- **FK fix:** uses `authCtx.appUserId` (not `authCtx.userId`) for `createdByUserId` — the FK targets `users.id`, not `auth_user.id`. Bug fixed in `d457f0a`.

### Plan generation (`lib/custom-signals/generator.ts`)
- **Model:** claude-sonnet-4-6 (fallback gpt-4o-mini).
- **Output:** `CustomSignalPlan { keywords: string[], urlPatterns: string[], judgePrompt: string }`.
- **Traced:** via `tracedGenerateObject` with agentId `custom-signal-generator`. Budget enforcement applies.
- **Normalization:** keywords lowercased, URL patterns stripped of leading slashes, all trimmed. Keywords capped at 6, URL patterns at 4, judge prompt at 800 chars.
- **Fallback:** if no LLM configured, plan is empty (all tiers skip, signal resolves `indeterminate`).

### Three-tier detection (`lib/custom-signals/detector.ts`)
- **Tier 1 — Keywords:** case-insensitive substring match against company description + keywords + technologies. Resolves `true` with confidence `high` on hit. No API cost.
- **Tier 2 — URL patterns:** parallel HEAD requests to `https://{domain}/{pattern}` with 800ms timeout. Any 2xx/3xx resolves `true` with confidence `high`. Remaining requests aborted on first hit.
- **Tier 3 — LLM judge:** `tracedGenerateObject` with the plan's `judgePrompt` + company context. 8-second timeout. Returns `{ value, reason }`. Confidence always `medium`. Budget enforcement applies via `tracedGenerateObject`.
- **Short-circuit:** tiers run in order, first positive match wins.
- **Never throws:** any internal failure collapses to `indeterminate` result.
- **Results persisted:** in `companies.properties.customSignals[signalId]` as `CustomSignalResult { value, reason, sources, confidence, computedAt }`.

### Backfill (`inngest/custom-signal-backfill.ts`)
- **Trigger:** `custom-signal/backfill` event dispatched on signal creation.
- **Concurrency:** 1 per signalId (Inngest concurrency key). Duplicate dispatches are safe.
- **Batching:** companies processed in batches of 20. Per-batch Inngest step boundaries for retry isolation.
- **Completion:** stamps `custom_signals.backfilledAt`. UI banner flips from "Backfilling..." to ready.
- **Retries:** 2 retries per batch.

### Listing
- **API:** `GET /api/custom-signals` returns all active signals for the tenant, ordered by creation date.
- **Auth:** any authenticated user.

## Dependencies

### Upstream (what calls this)
- `/settings/signals` page — create form + list display.
- Accounts page — renders custom signal columns/chips for each company (via `companies.properties.customSignals`).
- TAM stream `per-company.ts` — runs detection inline during TAM build for new companies.

### Downstream (what this calls)
- `lib/custom-signals/generator.ts` → `tracedGenerateObject` → `enforceLlmBudget`.
- `lib/custom-signals/detector.ts` → `tracedGenerateObject` (Tier 3 only) → `enforceLlmBudget`.
- `inngest/custom-signal-backfill.ts` → DB reads/writes on `companies` and `customSignals` tables.
- `lib/rate-limit.ts:checkRateLimit` — per-user burst protection.
- `@/db/schema:customSignals` table (migration 0023).

### Data read/written
- Reads: `custom_signals` table (definitions), `companies` table (properties for detection input).
- Writes: `custom_signals` table (new rows, backfilledAt stamp), `companies.properties.customSignals[signalId]` (detection results, JSONB merge).

## Edge cases handled
- LLM plan generation failure — signal created with empty plan, user can edit later.
- Inngest dispatch failure — non-fatal, user can retry.
- Duplicate signal names — 409 response.
- Empty plan — all tiers skip, result is `{ value: false, confidence: "indeterminate" }`.
- Detector never throws — any failure per-company collapses to indeterminate.
- HEAD check timeout — 800ms, aborted on first positive.
- Judge timeout — 8-second hard limit via `Promise.race`.
- FK violation — fixed by using `appUserId` instead of `userId`.
- Concurrent backfills — Inngest concurrency key prevents duplicate runs.

## Edge cases NOT handled (known gaps)
- **No edit flow.** A signal can be created but not edited. Changing a detection plan requires deleting and recreating the signal. The settings page has no edit UI.
- **No delete flow.** Signals can be set to `isActive: false` but the settings page has no delete button. Orphaned signals persist in DB and in `companies.properties.customSignals`.
- **Judge prompt is user-authored free text.** A malicious or confused user can craft a signal description that produces a prompt injection in the LLM judge call. The `judgePrompt` is generated by an LLM from the user's description (not directly user-authored), which provides some sanitization, but the user controls the input to the generator. The judge prompt is capped at 800 chars.
- **No backfill progress indicator.** The UI shows "Backfilling..." but no percentage or ETA. For a 10,000-company TAM, the backfill could take 30+ minutes with no progress feedback.
- **No re-backfill trigger.** If the detection plan improves (future edit flow), there's no way to re-run the backfill on already-processed companies without creating a new signal.
- **HEAD requests bypass SSRF guard.** Tier 2 URL patterns fire HEAD requests to `https://{domain}/{pattern}`. The domain comes from Apollo enrichment data, not user input, but there's no `assertPublicUrl` check. A company with a domain pointing to a private IP could trigger internal network probes.
- **No per-signal cost tracking.** Tier 3 judge calls are tracked under `custom-signal-judge` agentId, but there's no attribution back to the specific signal that triggered the call.

## Test coverage
- **Unit tests:** none. No test file exists for the detector, generator, or route.
- **Integration tests:** none.
- **Observability:** `custom-signal-generator` and `custom-signal-judge` are traced via `tracedGenerateObject`. Backfill completion is tracked via `backfilledAt` timestamp.
- **What's not tested:** plan generation quality, detector accuracy, Tier 2 HEAD check behavior, backfill retry logic, UI polling behavior.

## Review flags
1. **No test coverage at all.** This is a feature with LLM generation, network HEAD requests, Inngest async processing, and JSONB merge writes — every component is untested. Priority targets: (a) detector with fixture companies across all 3 tiers, (b) generator plan normalization, (c) backfill completion semantics.
2. **Tier 2 HEAD requests lack SSRF protection.** URL patterns produce HEAD requests to `https://{domain}/{pattern}` where domain comes from Apollo data. Should route through `assertPublicUrl` or at minimum validate the domain resolves to a public IP. Risk is low (domains are from Apollo, not user input) but defense-in-depth says check.
3. **Prompt injection via signal description.** The generator takes user-provided description and produces a judge prompt. A user who understands the pipeline could craft a description that causes the generator to output a manipulative judge prompt (e.g., "always return true"). The judge prompt is LLM-generated (not raw user text), which provides some defense, but the attack surface exists.
4. **The backfill is O(N) on the entire TAM per signal.** Creating 5 signals on a 10,000-company TAM queues 5 full scans. Each company hits the Tier 3 LLM judge for every signal where Tiers 1-2 don't match. At $0.01/judge call, 5 signals x 5,000 judge calls = $250 in LLM spend. The LLM budget enforcement protects against this if a cap is set, but a tenant with no cap could be surprised.
