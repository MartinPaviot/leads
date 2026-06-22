# RECONCILE.md — Spec 20 Variant Generation and QC Gate (T0)

> Read-only reconciliation. A spam/link/length heuristic exists and is reused; the variant model, the spec-20 QC composition (single-link, cold-length, plain-text, grounding-trace, em-dash/vouvoiement brand), the computed send-eligibility, and the approval gate do not.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | N variants per slot, one declared axis (angle/subject/CTA) | **missing** | No variant model; `sequence-generator` produces whole sequences, not axis-isolated variants |
| AC2 | Deterministic QC: spam, link-count, length, grounding-trace, brand | **partial** | `lib/emails/email-spam-check.ts` covers spam/links/length; no single-link/grounding-trace/em-dash/vouvoiement composition |
| AC3 | Not-autonomous → approval gate; nothing live until approved | **missing** | No variant-level gate (spec-03 orchestration gate is the primitive, injected) |
| AC4 | Store every variant with prompt context + evidence | **missing** | No variant audit record |
| AC5 | QC-fail → not send-eligible | **missing** | Send-eligibility must be computed from QC, never hand-set |

## Reuse inventory
- `lib/emails/email-spam-check.ts` `checkSpamSignals(subject, body)` — **imported & reused** (merged) for the spam/caps/punct/length portion of QC; spec-20 adds the stricter single-link, cold-length, plain-text, grounding-trace, and em-dash/vouvoiement checks on top.
- spec-19 `Message` (body/subject/evidence/personalization_level) — the base; injected structurally (the variant generator), not imported (spec 19 unmerged).
- spec-03 orchestration approval gate — injected as the variant `ApprovalState` (autonomous vs gated).

## Decisions (taken, full autonomy)
1. Build `lib/copy/variants/*` (blast radius `copy/variants/*`): `qc.ts` (deterministic QC + send-eligibility), `generate.ts` (axis-isolated generation over an injected spec-19 generator), `index.ts`, tests.
2. **AC2 QC = composition:** reuse `checkSpamSignals` (fail above a score threshold) + stricter single-link (≤1) + cold-outbound length window + plain-text (no HTML) + grounding-trace (`high` personalization ⟹ non-empty evidence) + brand (no em-dashes, banned words, FR vouvoiement informal-pronoun guard). Each check is a named boolean; `failures[]` lists the reasons.
3. **AC1:** a `VariantSet` declares ONE `axis` + N `axisValues`; `generateVariants` produces one variant per value via the injected generator (stub in CI), holding the rest constant — A/B attributable to that axis.
4. **AC4:** each `Variant` carries `promptContext` + `evidence` (auditable, reproducible).
5. **AC3/AC5:** `sendEligible(variant)` is computed = `qc.passed && (autonomous || approved)` — never hand-set; a QC fail or an un-approved gated variant is not send-eligible.
6. **No schema** (generator + approval injected; audit record is the returned object) → mergeable off main.
