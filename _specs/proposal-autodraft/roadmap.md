# Proposal Auto-Draft — Roadmap (living tracker)

Audit: `_research/teardown-proposal-automation/AUDIT.md`. Office hours:
`office-hours.md`. Each increment = its own Kiro spec, built + evaluated, then next.

| ID | Increment | Depends on | Delivers | Status |
|----|-----------|-----------|----------|--------|
| PROPOSAL-001 | DOCX template ingestion + LLM component detection + mark-once mapping + persistence | — | Upload a Word propale template; Elevay proposes its component structure; user confirms; saved as a reusable mapped template | SPEC |
| PROPOSAL-002 | Auto-draft fill from the info base (templatize + fill, DOCX) | 001 | Generate per-component content (wraps `draft-proposal`), heading-anchored fill of the original template, download filled DOCX. First end-to-end value | TODO |
| PROPOSAL-003 | Trust stack | 002 | Per-component confidence + abstention + citations to the exact source interaction (email/meeting/field) | TODO |
| PROPOSAL-004 | Proofread / review UX | 003 | Low-confidence-first triage, inline edit, regenerate-per-component, export; chat-commandable | TODO |
| PROPOSAL-005 | PPTX support | 002 | In-place fill (first-run edit + autofit recompute) | TODO |
| PROPOSAL-006 | PDF support | 002 | AcroForm fill (pdf-lib) for forms; regenerate-from-DOCX for designed PDFs | TODO |
| (deferred) | Post-send layer | 004 | e-sign (eIDAS), open/view analytics, optional/upsell line items, accept-and-pay. OUT of v1 | DEFERRED |

Statuses: SPEC (written, not built) · BUILDING · DONE (merged on PASS) · TODO · DEFERRED.
