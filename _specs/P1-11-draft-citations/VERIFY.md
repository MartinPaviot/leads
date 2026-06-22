# P1-11 — draft-citations — Verification (2026-06-22)

Branch `feat/agentic-p1`. Outbound drafts now carry derived citation sources, and
cited URLs are re-verified at APPROVAL (not just at send). No DDL (reuses the
existing `personalizationSources` jsonb column).

## What shipped (deploy-safe core)
- `claims-from-context.ts` `deriveSourcesFromContext(ctx)`: derives
  `{kind,label,href?,quote?}` from the ProspectContext (funding → kind:"funding";
  signals → href only when dataSource is a real http(s) URL; brief publicContent →
  quote). Pure. Wired into `sequence-draft-router.ts` (replaces the hard-coded
  `personalizationSources: []`), fail-open to `[]` on personalise failure.
- `approve/route.ts` — the KEY new guarantee: after the version check and BEFORE
  any mutation, `collectCitationUrls` → `verifySignalUrlsBatch` (7d cache) →
  `decideCitationGate`; a dead URL → 409 `{deadUrls, reviewReason}`, draft stays
  pending_approval. Reuses the exact send-bridge helpers (consistency).
- `freshness-gate.ts` `decideFreshnessGate(sources, briefGeneratedAt, now)`: pure,
  recalls drafts whose funding/headcount facts are > 14d old; fail-open when the
  brief date is null. Ready to wire into the send bridge.

## Tests (9, green) + tsc 0 + regression 210 green
- `claims-from-context.test.ts` (4) — funding source; URL vs non-URL href; public
  content quote; empty → [].
- `freshness-gate.test.ts` (5) — no-volatile ok; 20d stale; 13d fresh; null-date
  ok; isVolatileSource.
- Existing approve/citation/draft suites: 210 green (the new approval gate doesn't
  break them — empty sources → no-op).

## Deferred (documented follow-up)
- T1: LLM-emitted, sentence-anchored `claims[]` in `generatedSequenceSchema` + the
  CITATIONS prompt block (richer hrefs + verbatim sentences for the UI highlight).
  Today's sources are derived deterministically from context (gates work; inline
  highlight needs the sentence anchors).
- T4 wiring: `decideFreshnessGate` is built + tested but not yet called in
  `sequence-draft-to-outbound.ts` (needs `loadBriefGeneratedAt` + the recall block).
- T5: `<CitedBody>` inline-highlight component replacing the `<pre>` JSON dump in
  `sequence-draft-preview.tsx`.
