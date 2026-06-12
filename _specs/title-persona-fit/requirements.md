# Requirements — title-persona-fit

## User story

As a founder running "Score all contacts", I want each contact's ICP fit to reflect whether their job title matches the ICP's target personas — across languages and phrasings — so the score ranks the right people, not just the right companies.

## Acceptance criteria (EARS)

R1. WHEN an active ICP has a `person_titles` criterion AND a contact has a non-empty title, THE SYSTEM SHALL evaluate that criterion against a resolved persona set for the title (literal compare is only a fast-path), and the result SHALL count in the fit exactly like any other soft criterion (weight, coverage).

R2. WHEN the contact's normalized title is itself a member of the persona vocabulary, THE SYSTEM SHALL match it WITHOUT any LLM call.

R3. WHEN a title has no cached resolution for the current vocabulary, THE SYSTEM SHALL resolve it via ONE batched LLM call per ≤50 unknown titles (haiku, openai fallback), with output validated verbatim: returned personas not in the vocabulary are dropped; returned titles not in the request are ignored.

R4. WHEN the LLM is unavailable or the call fails, THE SYSTEM SHALL leave `person_titles` ABSENT from the contact context (criterion leaves the denominator, coverage drops, score never zeroed by infra failure) and SHALL say so in the score reasons.

R5. WHEN a resolution exists (including the valid result "no persona matches" = empty list), THE SYSTEM SHALL cache it on the contact (`properties.title_personas = { h, p }`) and reuse it on later runs with zero LLM calls.

R6. WHEN the persona vocabulary changes (any ICP's `person_titles` values edited), THE SYSTEM SHALL invalidate via vocabulary hash mismatch and re-resolve on the next scoring run.

R7. WHEN no active ICP has any `person_titles` criterion (the live tenant today), THE SYSTEM SHALL make ZERO LLM calls and produce byte-identical scores to the pre-feature behavior.

R8. WHEN the chat qualification skills (lead-qualification, inbound-lead-qualification) report a contact score, THE SYSTEM SHALL report the stored ICP-fit score (refreshed through the shared lib), never the legacy composite.

## Edge cases

- Empty/whitespace title → no injection, no resolution request.
- Resolved-empty (`p: []`) ≠ unresolved: resolved-empty IS evaluated (criterion unmatched — a true non-fit), unresolved is absent (no penalty).
- Required `person_titles` criterion (not authorable from the editor — it hardcodes soft, but the API allows it): unresolved/absent title zeroes the cell per the engine's required doctrine ("a must-have we cannot verify is not a fit"). Documented, tested.
- Titles equal after normalization ("CEO " / "ceo") resolve once.
- Vocabulary order/casing changes that normalize identically SHALL NOT change the hash.

## Evaluation steps (measured)

1. Unit suite green (resolution validation, cache, hash, fast-path, fail-closed, engine integration, dormant path).
2. Live regression: "Score all contacts" on the real tenant (vocabulary empty) → 612/612 scored, zero LLM calls, scores unchanged.
3. Dry-run measurement (read-only, real LLM): resolve the tenant's 446 real titles against a realistic persona vocabulary (CEO/DG, CFO, COO/ops, head of HR); report match counts and spot-check ≥5 French titles mapping correctly ("directeur général" → ceo-persona, "responsable rh" → HR persona, etc.).
