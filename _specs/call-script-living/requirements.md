# Requirements — Living Script Engine

- Feature id: `call-script-living`
- Branch: `feat/call-script-living`
- Status: **draft for review — not approved to build**
- Date: 2026-06-09
- Methodology source of truth (LOCKED, this engine implements it — it does not re-invent it):
  - `_research/cold-call-exchange-top01-2026-06.md` — Principle 0 (the call sells the meeting), Part 7 (annotated script), Part 9 (the 9 binary levers).
  - `_research/cold-call-prep-playbook-2026-06.md` — Chantier 5 (the modular script), §7 (per-industry adaptation).
- Already shipped on this branch (the seed): `lib/call-mode/live-script.ts` — `deriveOpeningReason()` is the first evidence→bloc rule (commit `612bdc9d`).

## 1. Problem statement (one sentence)

For each queued prospect, assemble the exact words to say on a 3–10 min cold call — opener, reason-to-call, insight, the one Tier-1 problem, the de-risked 45-min ask, objection answers — **from what we actually know about THIS prospect**, so the rep reads a grounded, methodology-correct script instead of a generic one.

## 2. Premise challenge — why this is NOT "generate a script with an LLM"

The naive build is a single prompt: *"here is the company, write me a cold-call script."* It is rejected, concretely:

1. **Hallucination is read aloud.** The script is spoken to a real prospect. A fabricated trigger ("I saw you raised a Series B") that is false ends the call and damages the brand. Every spoken claim must be grounded fact-by-fact or omitted — not "usually true".
2. **The methodology is a hard gate, not a style.** The 9 levers (permission gate, stated reason-to-call, exactly ONE Tier-1 problem, de-risked ask…) are pass/fail. A free-text LLM drifts off them. The script must be **validated deterministically against the levers before it is shown**.
3. **It must be measurable and self-improving.** A prompt has no feedback loop. The engine scores real call transcripts against the same levers and learns, per tenant, which objection answers actually advanced the call. A flywheel, not a static asset.
4. **It must be per-tenant and seam-visible.** The rep owns the template; the engine fills the grounded variables. A monolithic prompt hides exactly the seams the founder needs to refine, and re-hardcodes the vendor's own pitch (the current `coaching-playbook.ts` bug: it answers "$999/mo… Elevay… Outreach or Apollo" for every tenant).

**Therefore the engine is a pipeline of six steps, of which the LLM is one, constrained and verified:**

```
typed Evidence (grounded)  →  deterministic Assembler  →  ONE constrained+cited LLM step
   →  methodology Validators (9 levers)  →  Provenance render  →  post-call Scoring + Learning
```

The LLM only *phrases* facts that already exist in the evidence, under a schema, and **every claim it returns must cite the evidence id it used or it is dropped**. No evidence ⇒ no LLM call ⇒ deterministic fallback. This is the line between "intelligence" and "a prompt", and it is enforced in code (R3, R4), not promised in prose.

## 3. User stories

- As a founder-rep, when I select a prospect, the opener, reason, insight and problem are about THIS company, each tagged with where the fact came from, so I say it with conviction.
- As a founder-rep, I never see a claim the engine invented; if we don't know something, that bloc is simply absent.
- As a founder, I edit the template + the per-tenant objection bank once; the engine adapts the grounded parts per call.
- As a founder, after a batch of calls I see which levers I hit/missed and which objection answers work, and the script improves.

## 4. Requirements (EARS)

### R1 — Evidence layer (grounding)
- R1.1 WHEN a prospect is selected THE SYSTEM SHALL build a typed `ProspectEvidence` from the existing brain (`/api/brain/contact/[id]` → `ContactBrainJSON`): live `latestSignal`, `cachedDossier` (funding / hiringSignals / techStack / competitiveLandscape / recommendedApproach), `focalContact` (title), `directActivities`, owned/related deals, and prior call-intel/MEDDPICC written by `lib/voice/post-call-crm.ts`.
- R1.2 Each evidence item SHALL carry `{ value, source, observedAt?, confidence }` where `source` traces to a real origin (signal type, dossier field name, activity id, knowledge-entry id, call-intel id).
- R1.3 WHEN an item's `confidence` is below the consuming bloc's threshold, OR its `observedAt` is stale beyond the bloc's freshness window, THE SYSTEM SHALL treat it as absent for any spoken line.
- R1.4 THE SYSTEM SHALL NOT derive spoken evidence from inferred, unsourced context-graph edges or memories (same rule the pre-call brief already enforces in `_panels.tsx`).

### R2 — Deterministic assembler
- R2.1 THE SYSTEM SHALL select the reason-to-call by priority `signal → research angle → hiring → funding` (the shipped `deriveOpeningReason`; generalised here as one assembler rule).
- R2.2 THE SYSTEM SHALL select **exactly one** Tier-1 problem: the tenant sector enjeu whose trigger best matches the evidence (e.g. a detected replaceable tool in `techStack` ⇒ the "SaaS remplaçable" enjeu); ties broken by signal relevance.
- R2.3 THE SYSTEM SHALL pick the opener variant from evidence: "heard-the-name" when a credible peer reference exists for the sector, else permission-contextual, else direct.
- R2.4 THE SYSTEM SHALL assemble the de-risked 45-min ask from the tenant template (reversibility clause + concrete deliverable + binary slot) — **assembled, never generated**.
- R2.5 Assembly SHALL be pure and deterministic (same evidence + template ⇒ same script), so it is fully unit-testable without I/O or an LLM.

### R3 — Constrained generation (the single LLM step)
- R3.1 WHEN — and only when — grounded evidence supports it THE SYSTEM SHALL make ONE LLM call to phrase (a) the commercial insight/reframe and (b) the Tier-1 problem scene, in the tenant's register, **from the evidence**.
- R3.2 The call SHALL be zod-schema-constrained and SHALL require, for every produced claim, an `evidenceRef` naming the evidence item id it used.
- R3.3 WHEN a returned claim has no valid `evidenceRef`, or references an evidence id not in the input, THE SYSTEM SHALL drop that claim (**fail-closed**) and fall back to the template stub.
- R3.4 WHEN no model key is configured OR no evidence supports the insight THE SYSTEM SHALL skip the call and use the tenant template insight (or omit the bloc) — never error, never block the deterministic blocs.

### R4 — Methodology validation (the 9 levers, at compile time)
- R4.1 Before display THE SYSTEM SHALL validate the assembled script against the levers: opener is a permission gate (no listed problems inside it); reason-to-call present iff grounded; exactly one Tier-1 problem; ask is de-risked (reversibility + binary slot detected); an objection answer exists for the sector's top objections.
- R4.2 WHEN a lever fails THE SYSTEM SHALL surface the gap to the rep as a "needs attention" marker — never silently ship a non-compliant script.
- R4.3 The lever predicates SHALL be pure + unit-tested and SHALL be the **same** predicates reused by the post-call scorer (R7), so "what we coach" and "what we score" cannot drift.

### R5 — Provenance & trust
- R5.1 Every grounded bloc SHALL render its source (the provenance chip shipped for the reason generalises to insight + problem).
- R5.2 THE SYSTEM SHALL visually distinguish grounded-fact blocs from template blocs, so the rep knows which lines are "about them" vs default.

### R6 — Per-tenant + editable
- R6.1 The tenant template (opener, sector enjeux, insight stubs, ask, objection bank, peer references) SHALL be per-tenant, seeded from product + ICP + the tenant's own won/active deals — **never hardcoded to the vendor** (removes the `coaching-playbook.ts` Elevay/"$999"/tutoiement defaults).
- R6.2 Rep edits SHALL persist and take precedence over generated defaults (extend the existing `PUT /api/calls/script`).

### R7 — Post-call scoring + learning (Phase 2, designed now)
- R7.1 WHEN a call ends with a transcript THE SYSTEM SHALL score it against the 9 binary levers (deterministic detectors + a rubric-constrained judge for the subjective ones) and persist the per-lever result + a `perfScore`.
- R7.2 THE SYSTEM SHALL surface ONE lever to drill next, tied to the existing campaign funnel (`CampaignFunnelBar`).
- R7.3 THE SYSTEM SHALL feed objection answers that were said AND advanced the call into the per-tenant bank (`playbookEntries`, fields `{ type, content, outcomeLabel, perfScore }`), demoting dead ones — the live coaching cards then read the learned bank instead of the static `PLAYBOOK`.

### R8 — Non-goals (explicitly deferred oceans — flagged, not built here)
- Live teleprompter that tracks the transcript bloc-by-bloc (own spec).
- Tonality / PAVP voice analysis from Deepgram timings (own spec).
- Roleplay bot-persona for pre-call training (own spec).
- Auto-A/B of generator prompt variants beyond the lever scorecard.

## 5. Edge cases
- No brain / no company → opener + template only; no invented reason (already handled by the shipped seed).
- Partial evidence → each bloc independently present or absent.
- International Geneva prospect (English) → register switch is a template concern; the engine is language-agnostic.
- LLM down / no key → deterministic blocs still assemble and validate.
- Stale signal (old `observedAt`) → downweight; never present as "right now".
- Apollo-masked firmographics (industry null, see `reference_apollo-search-masks-firmographics`) → sector match falls back to dossier/purpose text, not an empty enjeu.

## 6. Evaluation — how we prove it is intelligent, not a prompt
1. **Grounding:** 100% of spoken grounded blocs trace to a real evidence id (fixture test asserts every `provenance.sourceRef` exists in the input evidence).
2. **Fail-closed:** an injected LLM claim with a bogus `evidenceRef` is dropped, not rendered (unit test on the insight validator).
3. **Determinism:** same evidence + template ⇒ byte-identical assembled script (snapshot test).
4. **Lever pass-rate:** assembled scripts over a fixture set pass the deterministic validators; deliberately broken templates fail the right lever.
5. **Scorer correlation (Phase 2):** per-lever scores from real transcripts spot-checked against a human pass; the levers code is the *same* as compile-time (no drift by construction).
6. **No regression:** `regression.sh` + `call-scripts.test.ts` + `live-script.test.ts` stay green.

## 7. Acceptance
- Phase 1 ships when: evidence + assembler + levers + the single constrained/cited LLM step + provenance are built, the panel renders the assembled per-prospect script with per-bloc sources, all evaluation tests 1–4 + 6 pass, and a non-compliant template is visibly flagged.
- Phase 2 (scorer + flywheel) is a separate merge gated on Phase 1.
