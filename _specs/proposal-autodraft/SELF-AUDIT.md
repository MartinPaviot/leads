# Proposal Auto-Draft — Expert Self-Audit (hostile QA)

Date: 2026-06-04. Reviewer stance: guilty until proven innocent (CLAUDE.md Phase 6).
"Built well" = a behavior with a **passing test** (cited). "Built badly" = a gap or
defect; where possible **demonstrated**, not asserted
(`app/apps/web/scripts/audit-proposal-weaknesses.ts`). Honest about what is
**unverifiable in this sandbox** (no LLM, no DB, no Office).

Scope: PROPOSAL-001/002/003/005, commits through `3956b49d` on `feat/landing-rework`.
61 proposal tests pass; full suite 3124 green; tsc clean.

---

## A. Built well — verified by test (61 behaviors)

| Module | Verified behaviors (test count) |
|---|---|
| `ooxml` read/extract | STORE + DEFLATE entry read, heading outline + offsets, split-run join, table-cell text, entity decode, absent entry → null, non-docx → throw, corrupt → degrade (11) |
| `component-map` | map validation (empty/blank-label/unknown-or-null dataKey/invalid shape/valid), normalizeToken, findAnchorOffset, isKnownDataKey (13) |
| `detect-components` | LLM-output normalization, id/order assignment, unknown dataKey → null, anchor resolve, retry-once, abstain (no model / 2 fails / empty text), trace metadata (6) |
| `storage` (DB-blob) | put returns ref + tenant-scoped insert, get owner-only, cross-tenant get → null, tenant-scoped delete (4) |
| `ooxml-write` (DOCX assembler) | writeZip/readAllZipEntries CRC round-trip, anchored-body replace preserving headings + sectPr + other entries (2) — **plus independent .NET `ZipFile`/XML validation** that the output opens |
| `fill` (resolve/generate-wiring/trust/persist) | field resolution incl. sanctioned deal total, generateSections trust shape + abstention, buildProposalFill citation resolve + confidence persist + **low-confidence-first triage**, error paths (6) |
| `sources` | activities+notes → enumerated citations, empty well-formed result (2) |
| `pptx` | slide text + title outline in presentation order, extractPptx degrade, slide-title-anchored body replace preserving titles + other parts (3) |
| API routes | upload (401/unsupported/too-large/unreadable/detected/degraded), list, detail 404, PATCH confirm/reject, DELETE; fill 400/201/409/404, detail, download streams real .docx (16) |

**Verdict:** the **deterministic machinery is genuinely solid** — zip read/write,
OOXML/PresentationML text extraction, map validation, field resolution, trust
wiring + persistence, tenant scoping, abstention paths, and HTTP contracts are all
test-backed. The DOCX writer is additionally proven to emit a valid, Office-openable
package by an independent reader.

---

## B. NOT verified — mocked or beyond the sandbox (honesty)

1. **LLM output quality is entirely unverified — HIGH.** Every test mocks
   `tracedGenerateObject`. We verified the *plumbing*, not the *intelligence*:
   detection segmentation quality, section prose quality, confidence **calibration**,
   and citation **accuracy** are untested. There are **zero golden evals** for the
   proposal skills, despite a mature eval harness in the repo
   (`chat-eval-suite`, `golden-eval-gate`). This is the core value, and it is unmeasured.
2. **No real Office document tested — HIGH.** All fixtures are hand-built, idealized
   OOXML. Real Word/PowerPoint output is messier: runs fragmented mid-word with
   changing `rPr`, `xml:space`, bookmarks/smartTags/field codes splitting text,
   localized style ids (e.g. `Titre1`, `Überschrift1`), `proofErr` tags. Our
   heading/title detection and exact-anchor matching are most exposed here.
3. **Live DB / migrations / RLS unexercised — MED-HIGH.** Storage, persistence, and
   routes are mock-verified only. Migrations 0059/0060 are not applied; the `bytea`
   round-trip, Postgres RLS, and real auth are unrun.
4. **PPTX not proven Office-openable — MED.** Only the transform is fixture-tested;
   package validity is *inferred* from the shared writer's DOCX `.NET` proof, not
   shown directly.

---

## C. Confirmed defects — demonstrated

1. **Anchor exact-match fragility — HIGH (DEMONSTRATED).**
   `assembleFilledDocx`/`assembleFilledPptx` locate each component by **exact
   (trim-only) string equality** of its `anchorHeading` against the document heading
   — and `anchorHeading` is the **LLM's free-text string**. Any drift (case,
   punctuation, trailing space, paraphrase) ⇒ the component is silently **unplaced**,
   its generated content **dropped**, with **no error surfaced**. Proof: anchor
   `"Executive summary"` vs document `"Executive Summary"` ⇒ `unplaced:["exec"]`,
   content not placed, original retained. This is systemic — it can corrupt *every*
   fill, and it fails silent.
2. **Zip-bomb exposure — MED-HIGH (DEMONSTRATED).** `readAllZipEntries` /
   `readZipEntry` call `inflateRawSync` on every entry with **no decompressed-size or
   ratio cap**. Proof: an 8.1 KB upload inflated to 8.0 MB (1012×); scaled linearly,
   a small upload becomes a GB allocation ⇒ OOM/DoS. Upload is authenticated (a
   tenant, not the public), which limits but does not remove the risk.

---

## D. Design / quality weaknesses — review level

1. **Confidence is LLM self-rated, not independently graded — HIGH.** LLMs are
   poorly calibrated and over-confident; the surfaced "confidence" is the model
   grading itself. There is **no verification that a cited source actually supports
   the claim** (citation hallucination passes through). The audit's exemplar
   (Responsive TRACE) grades the draft independently; we do not. The trust promise is
   weaker than it presents.
2. **Knowledge entries are not citable — MED.** Sections grounded on Elevay's own
   pricing/positioning have no citation and look ungrounded; only activities+notes
   are enumerated.
3. **No prompt caching — MED.** Detection + section generation resend the full
   context uncached every call (the `claude-api` skill mandates caching) — cost +
   latency at scale.
4. **i18n: `date.today` hardcoded `en-US` — LOW-MED.** Against the francophone wedge;
   should read `tenant.locale` (and the anti-creep rule forbids hardcoding locale).
5. **DOCX section replacement flattens structure — MED.** Body paragraphs are
   replaced with flat paragraphs inheriting only the *first* paragraph's `pPr`/`rPr`;
   lists, nesting, and tables-within-a-section lose their formatting.
6. **STORE re-zip inflates output size — LOW.** No compression on rewrite; not a
   size-faithful round-trip.
7. **PPTX envelope (SI-4) — MED.** One body placeholder per slide; titleless slides
   are undetectable/unfillable; no autofit recompute (overflow risk).
8. **`bytea` in Postgres — LOW-MED.** Whole file loaded into process memory per get;
   DB bloat at scale (documented as swappable).
9. **No fill idempotency — LOW.** Re-filling creates new rows.

---

## E. New Kiro increments (the plan), prioritized by severity × the proofread-only promise

| Spec | Closes | Severity | One line |
|---|---|---|---|
| **PROPOSAL-007** — eval harness + real-doc fixtures | B1, B2 | HIGH | Golden evals for detect/fill/trust + commit real Office-made .docx/.pptx fixtures and assert extraction/anchor/fill on them |
| **PROPOSAL-008** — robust anchoring | C1 | HIGH | Anchor by outline index/stable id + reconcile (exact→normalized→fuzzy); flag unresolved at confirm, never drop silently at export |
| **PROPOSAL-009** — independent trust grading | D1, D2 | HIGH | Verify each citation supports its claim + a TRACE-style grader; make knowledge entries citable; surface "unsupported" |
| **PROPOSAL-010** — upload hardening | C2, D8 | MED-HIGH | Decompressed-size + entry-count + ratio caps in the zip reader; strict validation; storage behind a streaming/S3 adapter |
| **PROPOSAL-011** — fidelity + i18n + cost polish | D3-D7 | MED | Preserve DOCX list/nesting; PPTX autofit; DEFLATE re-zip; tenant.locale dates; prompt caching |
| PROPOSAL-004 (open) | — | MED | Review UX: inline edit + regenerate-per-component |
| PROPOSAL-006 (open) | — | HIGH effort | PDF (no reflow → AcroForm fill or regenerate) |

**Recommended order:** 008 (correctness, fails-silent) → 010 (security, quick) →
007 (measure the intelligence) → 009 (make trust real) → 011 (polish). 008 + 010 are
small, high-leverage, and fully testable in-sandbox.
