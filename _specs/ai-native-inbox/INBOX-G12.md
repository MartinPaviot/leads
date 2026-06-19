# INBOX-G12 — Voice-of-customer rollup across threads
> Theme: T7 · Autonomy rung: proactive · Priority: P2
> Pillar: P5 GTM moat

## User story
As a founder, I want the recurring asks buried in my inbox — "I wish you integrated X", "too
expensive", "needs SSO" — extracted from real threads, deduplicated by meaning, ARR-weighted, and
rolled up across the whole inbox, each backed by the verbatim quote and its source thread, so I see
what the market is actually telling me instead of it dying in individual replies.

## Why (audit anchor)
This is the Forward-Deployed-AE move Monaco embeds (proactive business intelligence) and Lightfield's
schema-less customer memory, applied to the inbox. No mailbox does it: Superhuman summarizes a single
thread, never rolls patterns up across all mail (`ai-feature-deep-dive.md`). We already have the
capture pipeline (every inbound is an `activities` row) **and** the VoC engine: `customer_requests`
(`db/schema/voice-of-customer.ts`) stores classified, canonical-key-deduplicated, ARR-weighted asks,
and `lib/voice-of-customer/classifier.ts` decides what becomes a row. The inbox is a first-class
*source* for that engine, and the rollup is the surface — a category our cited GTM graph uniquely enables.

## Requirements (EARS)
- WHEN an inbound email (or sequence reply) expresses a request — feature ask, integration ask, UX
  friction, pricing pushback, expansion intent — the system SHALL classify it via the VoC classifier
  and, when it qualifies, record a `customer_requests` row with `source:'inbox'`, the verbatim quote
  (trimmed to 2000 chars), and a `canonicalKey` for dedup.
- The system SHALL deduplicate asks that mean the same thing by `canonicalKey` (e.g. "salesforce-
  bidir-sync") so 12 threads asking for the same thing roll up to one weighted item, not 12.
- The system SHALL copy the account's estimated ARR onto the row at write time (`tenantArrUsd`) so the
  rollup can sort by weight without a join, and SHALL keep each row linked to its source thread + account.
- The system SHALL present a rollup view across threads: each canonical ask with its count, ARR weight,
  status, and the list of source threads/quotes (each citation opens the originating email).
- The system SHALL NOT fabricate a request: only a classifier-qualified ask becomes a row; ambiguous
  mail produces nothing, never a guessed "feature request".
- The system SHALL ride the autonomy dial (INBOX-T11): extraction Suggests a VoC item for confirmation
  by default (Auto for tenants who trust it), and SHALL show the "why" (the matched quote).
- The system SHALL hard-scope to the viewer's tenant; VoC rows, ARR weights and source threads SHALL
  never cross tenants.
- The rollup SHALL be honest and factual (no hype): it reports counts/quotes/ARR, never a
  recommendation or a superlative.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN three separate replies asking for an SSO/SAML option WHEN classified THEN one
  `customer_requests` item (canonicalKey "sso-saml", count 3) appears in the rollup, each backed by
  its verbatim quote + source thread.
- GIVEN a pricing-pushback reply from a high-ARR account WHEN rolled up THEN the item carries that
  account's `tenantArrUsd` and sorts above a same-count ask from a low-ARR account.
- GIVEN a thread with no request (a logistics email) WHEN processed THEN no VoC row is created.
- GIVEN a VoC item WHEN a citation is clicked THEN the originating email opens (scoped to the tenant).
- GIVEN extraction on Suggest WHEN an ask is detected THEN it is staged with the matched quote as the
  "why"; nothing is recorded until confirmed.
- GIVEN an item already shipped WHEN a new matching ask arrives THEN it dedups onto the existing item
  (status reflects "shipped"), not a new row.
- GIVEN two tenants WHEN VoC rolls up THEN no other-tenant request, quote or ARR appears.

## Edge cases & failure handling
- Same ask phrased differently → the classifier's `canonicalKey` merges them; if it can't, they remain
  separate (under-merge is safer than a wrong merge).
- Verbatim > 2000 chars → trimmed on insert (schema rule).
- Account ARR unknown → `tenantArrUsd` null; the item still rolls up by count, sorts after weighted ones.
- Classifier unavailable → no extraction (no fabricated rows); inbound is still captured as an activity.
- Mixed languages → classify in the source language; canonical keys are language-neutral slugs.
- A request that's actually a support issue vs a feature ask → `kind` distinguishes (bug_report vs
  feature_request); routing differs but both are captured.
- Bookings ≠ ARR: `tenantArrUsd` is an estimate for prioritisation weight, not a revenue claim.

## Best-in-class bar
- **Cross-thread, deduped, ARR-weighted, cited**: the inbox becomes proactive business intelligence —
  the market's recurring asks surfaced from real mail with the verbatim proof and the revenue at stake.
  No mailbox rolls patterns up across all threads; ours does because every email is already in our graph.
- **FDAE-in-product**: the same VoC engine an embedded forward-deployed AE would maintain, fed
  automatically from the inbox, human-gated — Lightfield memory + Monaco BI, native.

## Design sketch
- **Data:** `customer_requests` (`db/schema/voice-of-customer.ts:23` — `kind`, `verbatim`, `source`,
  `canonicalKey`, `tenantArrUsd`, `status`, `metadata{ dealId, accountId, threadId }`); source = inbound
  `activities` (`db/schema/core.ts:235`). ARR estimate from the account (deal-derived, via existing
  account-stage/ARR helpers).
- **API:** the VoC classifier `lib/voice-of-customer/classifier.ts` runs on captured inbound (in the
  enrich pass after `captureInboundEmail`), writing rows via the autonomy seam (T11 Suggest/Auto). A
  rollup endpoint `GET /api/voice-of-customer?source=inbox` aggregates by `canonicalKey` with counts +
  ARR sum + source links. (If a rollup endpoint exists for the Customer Council, reuse + add the
  source/thread links.)
- **UI:** a "Voix du marché" section — on `/reports` (the existing insights surface) and a compact
  inbox affordance ("3 demandes récurrentes cette semaine" deep-linking to the rollup). Each item: an
  expandable card (`--color-bg-card`, `rounded-lg`) with count, ARR weight chip, status, and verbatim
  quotes as citations (lucide `MessageSquareQuote`, sober). Inline Suggest cards in the reading pane
  ("Demande détectée : intégration X — enregistrer ? · why = la citation", T11). Light+dark via tokens,
  no emoji, no provider name, every item cited + factual.
- **AI:** the existing VoC classifier (no new model); extraction gated by the autonomy dial; honours
  zero-retention (P03). Output is factual counts/quotes — no recommendations (no-hype convention).
- **Security/perf:** tenant scope on every row + aggregate; canonical-key index covers the rollup; bounded.

## Tasks (ordered)
1. Run the VoC classifier on captured inbound (enrich pass) → write `customer_requests` with
   `source:'inbox'` + verbatim + `canonicalKey` + linked thread, via the T11 Suggest/Auto seam. (verify:
   an SSO ask creates one row; a logistics email creates none) (test: classifier-integration test —
   qualifies/doesn't, dedups by canonicalKey)
2. Rollup endpoint `GET /api/voice-of-customer?source=inbox` aggregating by canonicalKey (count + ARR
   sum + source links), tenant-scoped. (verify: 3 SSO asks → one item count 3 with quotes) (test: route
   test — dedup + ARR weight + scope)
3. "Voix du marché" rollup UI on `/reports` + inbox deep-link + inline Suggest cards. (verify: browser —
   rollup lists canonical asks with quotes; clicking a citation opens the thread) (test: render)
4. ARR weighting + honesty + scope guards. (verify: high-ARR pricing ask sorts above low-ARR; copy is
   factual; no cross-tenant rows) (test: weighting + no-hype-copy + scope cases)

## Current-state notes (VERIFY before building — code moves)
- VoC engine EXISTS: `customer_requests` (`db/schema/voice-of-customer.ts:23`) with `canonicalKey`
  dedup (`:41`), `tenantArrUsd` copied at write time (`:44`), `kind`/`source`/`status`/`metadata`
  (`:30`–`:49`), and `lib/voice-of-customer/classifier.ts` as the gatekeeper. **Reuse — add `'inbox'`
  as a source, don't build a parallel store.**
- The inbox capture pipeline already records every attributable inbound as an `activities` row
  (`captureInboundEmail`, `lib/capture/email-capture.ts:179`) — that's the VoC source feed.
- Account ARR estimate: derive from deals (account-stage-derived helpers / `lib/deals/amount.ts`);
  bookings ≠ ARR — `tenantArrUsd` is a prioritisation estimate only.
- Autonomy dial = INBOX-T11 (Suggest by default; the matched quote is the "why").
- Cohort/insights surface = `/reports` (cohort-insights + rev-equation engines, MEMORY) — host the
  rollup there; no LLM-recommendations (those were deliberately removed; keep it factual).
- Confirm the classifier's current signature + the canonical-key vocabulary before wiring (they move):
  grep `customer_requests` writers + `lib/voice-of-customer/`.
