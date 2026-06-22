# RECONCILE.md — Spec 13 Segmentation and TAM Estimate (T0)

> Read-only reconciliation, 5-finder audit. Greenfield for the archetype/segment concept: no `campaigns`/`segments` table, no volume/micro/signal taxonomy (`outreach_playbooks.strategyType` is an orthogonal outreach-tactic enum). A live-signal registry exists but isn't bound to segments. **Schema-changing** → parks.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Three archetypes (volume/micro/signal), exactly one per campaign | **missing** | No `archetype` anywhere; `strategyType` is an orthogonal tactic enum; no segment/campaign entity |
| AC2 | volume partitions; micro requires narrowing; signal binds + admits only signal-carrying | **missing** | No archetype rules; `DEFAULT_SIGNALS` registry exists but no segment binds to it or gates admission |
| AC3 | TAM via count-only sourcing, no enrichment credits | **partial** | spec-05 `countAccounts` (MERGED, credit-free) + `/api/tam/estimate` exist, but nothing wires a segment → TAM |
| AC4 | Persist archetype, AST, signal binding, estimated_tam, goal, channel mix, daily budget | **missing** | No `segments` table |
| AC5 | Signal loss → stop new admissions, leave sent intact | **missing** | No signal-bound admission gate |

## Reuse inventory
- `lib/sourcing/apollo` `countAccounts` (MERGED, **injected**) — credit-free TAM count (AC3); `CanonicalICPQuery` — the filter shape.
- `tam-stream/signals/index.ts` `DEFAULT_SIGNALS` (investor_overlap, funding_recent, hiring_intent, yc_company) — the **signal source registry** to bind to (AC2/AC5).
- spec-11 ICP version (parked, **injected**) — the base ICP a segment narrows.

## Decisions (taken, full autonomy)
1. Build `lib/segmentation/*` + a `segments` table (migration `0088`). **Distinct** from `outreach_playbooks.strategyType` (must not overload it).
2. **AC1/AC2:** `buildSegment(icpVersionId, archetype, params)` — `archetype ∈ {volume,micro,signal}`; **micro throws** without ≥1 narrowing dimension; **signal throws** without a `signalKey` binding to a registry signal. Returns a stored definition AST.
3. **AC3:** `estimateTam(query, deps)` via the **injected** `countAccounts` (count-only, credit-free).
4. **AC2/AC5:** `admitsAccount(segment, accountSignals)` — signal segments admit only accounts **currently carrying** the bound signal; on signal loss the account is no longer admitted (stops NEW admissions), and admission never touches already-sent activity.
5. **AC4:** `segments` (archetype enum, definition jsonb AST, signal_binding, estimated_tam, goal, channel_mix jsonb, daily_budget). Schema → **parks pending prod `0088`**.

Deterministic build/admission/TAM unit-tested with a stub count. Schema change → parks (like 00/02/03/04/11).
