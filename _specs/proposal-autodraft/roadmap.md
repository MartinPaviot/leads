# Proposal Auto-Draft — Roadmap (living tracker)

Audit: `_research/teardown-proposal-automation/AUDIT.md`. Office hours:
`office-hours.md`. Each increment = its own Kiro spec, built + evaluated, then next.

| ID | Increment | Depends on | Delivers | Status |
|----|-----------|-----------|----------|--------|
| PROPOSAL-001 | DOCX template ingestion + LLM component detection + mark-once mapping + persistence | — | Upload a Word propale template; Elevay proposes its component structure; user confirms; saved as a reusable mapped template | BUILT — schema/lib/skill/routes/UI/chat-tool, 45 tests green, tsc clean; pending live run (apply 0059 + start app) |
| PROPOSAL-002 | Auto-draft fill from the info base (fill + DOCX writer) | 001 | Resolve fields + generate sections from the deal's info base, heading-anchored fill of the original template, download filled DOCX | BUILT — fill lib + zero-dep DOCX writer + skill/routes/chat-tool/UI, tests green, tsc clean; pending live run |
| PROPOSAL-003 | Trust stack | 002 | Per-component confidence + abstention + citations to the exact source interaction (email/meeting/field), low-confidence-first triage in the review UX | BUILT — sources collector + trust-aware fill + skill/route/UI, tests green; no migration (reused 002 cols) |
| PROPOSAL-004 | Proofread / review UX | 003 | Low-confidence-first triage, inline edit, export; chat-commandable | BUILT — triage + inline edit (PATCH proposal components) + export; regenerate-per-component deferred |
| PROPOSAL-005 | PPTX support | 002 | Slide-title-anchored body fill; detection/fill/trust reused; download assembles filled .pptx | BUILT — pptx.ts + upload/download branch + UI accept, fixture round-trip test green; SI-4 envelope |
| PROPOSAL-006 | PDF support | 002 | AcroForm fill (pdf-lib) for forms; regenerate-from-DOCX for designed PDFs | TODO |
| PROPOSAL-007 | Eval harness + real-doc fixtures | 002 | Golden evals (detect/fill/trust) + real Office .docx/.pptx fixtures | SPEC (SELF-AUDIT B1/B2, HIGH) |
| PROPOSAL-008 | Robust anchoring | 001 | Bind anchors to outline index + reconcile (exact→fuzzy); never drop silently | BUILT — index binding + reconcile in both assemblers; C1 demo flips to "handled"; 62 tests |
| PROPOSAL-009 | Independent trust grading | 003 | Citation-support verification + TRACE-style graded confidence; knowledge citable | BUILT (core) — grade.ts citation-support + MIN(grade,self) confidence + unsupported flag; knowledge-citable (AC3) deferred |
| PROPOSAL-010 | Upload hardening | 001 | Zip decompressed/ratio/count caps; storage S3 adapter | BUILT (caps + inspectArchive + 422 route guard; C2 demo flips to FIXED). S3 adapter still TODO |
| PROPOSAL-011 | Fidelity + i18n + cost polish | 002 | PPTX autofit, DEFLATE re-zip, locale dates | BUILT — DEFLATE + locale dates + PPTX autofit reset; DOCX list-nesting + prompt caching deferred |
| (deferred) | Post-send layer | 004 | e-sign (eIDAS), open/view analytics, optional/upsell line items, accept-and-pay. OUT of v1 | DEFERRED |

Self-audit: `SELF-AUDIT.md` (hostile QA; evidence in `app/apps/web/scripts/audit-proposal-weaknesses.ts`).

Statuses: SPEC (written, not built) · BUILDING · DONE (merged on PASS) · TODO · DEFERRED.
