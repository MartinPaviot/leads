# RECONCILE.md — Spec 12 Lookalike ICP (T0)

> Read-only reconciliation, 5-finder audit. No `deriveLookalike`/lookalike module exists. The single-domain ICP inference and the closed-deal win/loss trainer both aggregate, but neither computes attribute **coverage %** over a user-supplied customer sample.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Enrich sample + compute attribute **frequencies** deterministically | **partial** | `predictive-scorer.trainScoringModel` counts attrs over **closed deals** (wins/losses, Naive Bayes) — wrong sample, wrong output; ICP path is single-domain LLM |
| AC2 | Per-criterion evidence (coverage % across sample) | **missing** | `inference-prompt` hands customers to the LLM raw; criteria carry only a model-chosen weight; no coverage/evidence field |
| AC3 | Agent only selects causal + weights, never invents; frequency deterministic | **partial** | LLM infers an ICP but from raw text, not over measured frequencies; no causal-vs-incidental over a frequency table |
| AC4 | Write a draft ICP version (spec 11) | **partial** | spec-11 `saveIcpVersion` exists (parked, injected); no lookalike writes one |
| AC5 | Eval: every weighted attribute traces to a measured frequency | **missing** | No eval tying weights to sample frequencies |

## Reuse inventory
- `scoring/predictive-scorer.ts` `featuresToCategorical` — the per-attribute categorical extraction (the counting primitive).
- spec-08 `enrichField` (MERGED) — sample enrichment, **injected**.
- spec-11 `saveIcpVersion` / `IcpCriterionSnapshot` (parked, **injected**) — the draft write.
- spec-04 `runAgent` (parked, **injected**) — causal selection + weighting.
- spec-09 criterion shape — the output criteria.

## Decisions (taken, full autonomy)
1. Build `lib/icp/lookalike/*`: `deriveLookalike(sample, deps): DraftIcp`. Pure frequency analysis + injected enrich/agent/store.
2. **AC1/AC2:** `computeFrequencies(sample, fields)` → per `(field, value)` `{count, sampleSize, coverage}` (≥ minCoverage); each proposed criterion carries that **evidence**.
3. **AC3/AC5:** the **injected** `runAgent` (kind `lookalike-weighting`) sees ONLY the measured frequency table and returns selected attributes + weights. **Enforced:** any selected attribute not present in the frequency table is **dropped** (the agent can never invent); a failed eval yields no draft.
4. **AC4:** write the result as a **draft** ICP version via the injected spec-11 `saveDraft` (never active).
5. Deterministic frequency + the never-invent filter unit-tested with stub enrich + stub runAgent. No schema → **mergeable** off main.
