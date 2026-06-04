# PROPOSAL-011: Fidelity + i18n + cost polish

Closes SELF-AUDIT D3-D7 (MED/LOW): structure flattening on DOCX replace, PPTX
autofit overflow, STORE re-zip bloat, hardcoded en-US dates, no prompt caching.

## Requirements
**AC1 (DOCX structure preserved)** WHEN replacing a section body, THEN list items
keep their `numPr`/level and the per-paragraph `pPr`/`rPr` of the matched paragraph
they replace (not just the first), so bullets/nesting survive. Multi-line content
maps line→paragraph using the nearest original style.
**AC2 (PPTX autofit)** WHEN filling a slide body whose placeholder uses
`a:normAutofit`, THEN `fontScale`/`lnSpcReduction` are reset (or recomputed) so
PowerPoint reflows to fit instead of overflowing.
**AC3 (DEFLATE re-zip)** THEN `writeZip` compresses entries (DEFLATE) so the output
is not larger than the input.
**AC4 (locale dates)** THEN `date.today` formats per `tenant.locale` (fr-FR for the
francophone wedge) — read from config, never hardcoded (anti-creep).
**AC5 (prompt caching)** THEN detection + section-generation reuse a cached system/
context prefix (Anthropic prompt caching) to cut cost + latency on repeat calls.

## Design
- `ooxml.ts`: `writeZip` gains DEFLATE (`deflateRawSync`); replacement keeps each
  replaced paragraph's `pPr`/`rPr` and copies `numPr` when present.
- `pptx.ts`: strip/zero `a:normAutofit` attributes in the filled `bodyPr`.
- `fill.ts`: `resolveFieldValue` takes `locale` (from tenant config) for `date.today`;
  add `cacheControl` on the LLM system/context blocks (claude-api skill).
- Reuse the `claude-api` skill guidance for caching.

## Tasks
1. DEFLATE writeZip + paragraph-style-preserving replace (+ tests).
2. PPTX autofit reset (+ test).
3. Locale-aware dates from tenant config (+ test, no hardcoded locale).
4. Prompt caching on detection + fill calls. tsc + regression.
