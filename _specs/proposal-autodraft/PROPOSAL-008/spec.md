# PROPOSAL-008: Robust anchoring (close the silent round-trip failure)

Closes SELF-AUDIT C1 (HIGH, demonstrated): components are located by exact
string-equality of the LLM's free-text `anchorHeading` against the document
heading, so any drift (case/space/paraphrase) silently drops the component's
content at export with no error.

## Root cause
Detection stores the model's free-text heading; the assembler matches it
verbatim. The model and the document disagree on the string → `unplaced`, silent.

## Requirements
**AC1 (bind to the outline, not free text)** WHEN detection runs, THEN each
component's anchor is chosen as an **index into the numbered outline** the model is
given; the stored `anchor.headingText` is set to the *extractor's exact* outline
text (never the model's paraphrase), and `anchor.offset` from that outline entry.
An out-of-range/absent index ⇒ `anchor = null` (no fabricated anchor).
**AC2 (reconcile at fill, never fail silent)** WHEN assembling, THEN an anchor is
matched exact → case/whitespace-normalized → fuzzy (token-set ratio ≥ 0.9) against
the document's actual headings; the first confident match wins. A component that
still cannot be resolved is returned in `unplaced` AND flagged for the user.
**AC3 (catch it at confirm, not at export)** WHEN the user confirms the map, THEN
every `section` anchor is validated against the current outline; unresolved anchors
are reported (`unresolved_anchors`) so they are fixed before any fill.
**AC4** No silent drops: every dropped component appears in `unplaced` and (AC3) is
visible pre-fill.

### Edge cases
- Duplicate headings → index disambiguates (free text could not).
- Legacy maps (free-text anchors, no index) → reconciliation (AC2) still applies.

## Design
- `detect-components.ts`: LLM schema field `anchorIndex: number | null` (index into
  the outline shown as `0: <h>\n1: <h>...`); normalize anchor from
  `outline[anchorIndex]`. Keep `anchorHeading` (now = the exact outline text).
- `ooxml.ts` / `pptx.ts`: extract a `reconcileAnchor(headings, target)` helper
  (exact → normalized → fuzzy); use it in `assembleFilledDocx`/`assembleFilledPptx`
  instead of `===`. Add a small token-set-ratio fn (no dep).
- `component-map.ts`: `validateConfirmedMap` (or a new `resolveAnchors`) reports
  unresolved section anchors given the outline; surfaced by the PATCH route.

## Tasks
1. Outline-index anchoring in detection (+ test: model returns index → exact text stored).
2. `reconcileAnchor` + wire into both assemblers (+ tests: case/space/fuzzy drift now PLACES; true miss → unplaced).
3. Confirm-time anchor resolution in PATCH (+ test).
4. Update the demonstrated case from SELF-AUDIT to now PASS (regression for C1).
5. tsc + regression.
