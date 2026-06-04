# Proposal Auto-Draft — Roadmap (living tracker)

Audit: `_research/teardown-proposal-automation/AUDIT.md`. Office hours:
`office-hours.md`. Each increment = its own Kiro spec, built + evaluated, then next.

| ID | Increment | Depends on | Delivers | Status |
|----|-----------|-----------|----------|--------|
| PROPOSAL-001 | DOCX template ingestion + LLM component detection + mark-once mapping + persistence | — | Upload a Word propale template; Elevay proposes its component structure; user confirms; saved as a reusable mapped template | BUILT — schema/lib/skill/routes/UI/chat-tool, 45 tests green, tsc clean; pending live run (apply 0059 + start app) |
| PROPOSAL-002 | Auto-draft fill from the info base (fill + DOCX writer) | 001 | Resolve fields + generate sections from the deal's info base, heading-anchored fill of the original template, download filled DOCX | BUILT — fill lib + zero-dep DOCX writer + skill/routes/chat-tool/UI, tests green, tsc clean; pending live run |
| PROPOSAL-003 | Trust stack | 002 | Per-component confidence + abstention + citations to the exact source interaction (email/meeting/field), low-confidence-first triage in the review UX | BUILT — sources collector + trust-aware fill + skill/route/UI, tests green; no migration (reused 002 cols) |
| PROPOSAL-004 | Proofread / review UX | 003 | Low-confidence-first triage, inline edit, regenerate-per-component, export; chat-commandable | TODO |
| PROPOSAL-005 | PPTX support | 002 | Slide-title-anchored body fill; detection/fill/trust reused; download assembles filled .pptx | BUILT — pptx.ts + upload/download branch + UI accept, fixture round-trip test green; SI-4 envelope |
| PROPOSAL-006 | PDF support | 002 | AcroForm fill (pdf-lib) for forms; regenerate-from-DOCX for designed PDFs | TODO |
| (deferred) | Post-send layer | 004 | e-sign (eIDAS), open/view analytics, optional/upsell line items, accept-and-pay. OUT of v1 | DEFERRED |

Statuses: SPEC (written, not built) · BUILDING · DONE (merged on PASS) · TODO · DEFERRED.
