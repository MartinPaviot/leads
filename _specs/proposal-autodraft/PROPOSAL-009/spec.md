# PROPOSAL-009: Independent trust grading (make "proofread-only" real)

Closes SELF-AUDIT D1 (HIGH) + D2 (MED): today's confidence is the LLM grading
itself (poorly calibrated, over-confident) with no check that a cited source
actually supports the claim, and knowledge entries are not citable.

## Requirements
**AC1 (citation support check)** WHEN a section is generated with citations, THEN
each citation is verified to actually support the section's claims (a cheap
secondary pass: a focused grader call, or deterministic n-gram/entailment overlap
between the claim sentences and the cited source text). Unsupported citations are
dropped and the component is flagged `unsupported_claims`.
**AC2 (graded confidence, not self-rated)** THEN the stored confidence is derived
from independent signals — citation support ratio, source coverage, abstention —
not solely the model's self-rating (TRACE-style: grounding + completeness).
**AC3 (knowledge citable)** THEN Elevay knowledge entries used for grounding are
enumerated as `[K1..]` citable sources alongside activities/notes, so pricing/
positioning claims carry a citation.
**AC4 (surface)** THEN the review UI distinguishes "grounded" vs "unsupported"
components and shows the support ratio; abstained + unsupported sort first.

### Edge cases
- A section with confident prose but zero supporting citations → downgraded to low +
  `unsupported_claims`, even if the model self-rated "high".
- No keys / grader unavailable → fall back to self-rating but mark `ungraded` (honest).

## Design
- `sources.ts`: add knowledge entries (via `retrieveKnowledge`) as `K`-prefixed
  citable sources with text for the support check.
- `lib/proposals/grade.ts`: `gradeSection(content, citations, sourcesById)` →
  `{ supportRatio, confidence, unsupported: Citation[] }`; deterministic overlap
  grader + optional LLM entailment behind a key flag.
- `fill.ts`: after generation, grade; override confidence; persist support metadata
  in `proposal_components.source`.
- Detail route + UI: surface support ratio + unsupported flags.

## Tasks
1. Knowledge as citable sources (+ test).
2. `grade.ts` overlap grader (+ tests: supported vs hallucinated citation).
3. Wire grading into `buildProposalFill`; persist + surface (+ tests).
4. UI support-ratio + unsupported flag. tsc + regression.
