# Proposal Auto-Draft — Office Hours (epic)

Rules applied (hook returned none this session): no emoji in UI; brand "Elevay"
(never "LeadSens" in user-facing text); every query tenant-scoped; never sum
`projectAmount` + `platformArr` (use `getDealAmountDisplay`); verify live code
before specing. Source audit: `_research/teardown-proposal-automation/AUDIT.md`.

## Problem statement (one sentence)
A founder-led seller wants Elevay to take a proposal template (Word now; PPT/PDF
later) and fill every component from what Elevay already knows about the prospect,
so the only remaining human step is proofreading before sending.

## Premise challenge — should we build this at all?
- **We already have `draft-proposal`.** It emits a *house-style proposal JSON*
  (exec summary, problem, solution, plan, pricing, next steps). It does NOT use
  the user's template and produces no sendable artifact. It is a content engine,
  not a deliverable. Keep it; wrap it.
- **Why not integrate PandaDoc/Qwilr?** They fill *their* template, not the user's;
  they add per-seat cost and a dependency; and their grounding is CRM merge-fields,
  not Elevay's live interaction memory. Integrating them would be off-mission
  (chat-first, autonomous, zero-config) and would surrender the one advantage we
  have. Rejected.
- **Is the juice worth the squeeze?** The audit shows an unoccupied quadrant:
  high template-fidelity × deep prospect-specific grounding × proofread-only.
  Elevay is uniquely placed because it already captures the prospect info base as a
  byproduct of normal use. This is a wedge, not a me-too. Build it.

## Alternatives explored
1. **House-style generator** (render Elevay's own beautiful proposal). Rejected:
   loses the user's brand/template, commoditized (Gamma/Storydoc own this), and the
   user explicitly wants *their* template filled.
2. **Third-party proposal tool integration.** Rejected (see premise challenge).
3. **Template-faithful, info-base-grounded fill (chosen).** Ingest the user's
   template, map its components, fill each from the info base, expose a trust layer
   (confidence + citations + abstention) so "proofread-only" is credible, export in
   the original format.

## Layer check (CLAUDE.md three layers of knowledge)
- **Layer 1 (tried-and-true, do not reinvent):** OOXML templating. `docxtemplater`
  + `mammoth` for DOCX. We will NOT hand-roll XML run-gluing.
- **Layer 2 (new/popular, scrutinize):** LLM-assisted component detection of an
  un-tagged customer template; the RFP-automation trust stack (confidence/
  abstention/citations).
- **Layer 3 (first principles, prize):** grounding the fill in Elevay's live,
  prospect-specific info base — the thing no competitor can copy without rebuilding
  the capture layer. This is where we spend our originality.

## Completeness target
v1 = DOCX, draft-only, with the trust stack and a proofread surface. Target 9/10.
Documented exclusions (oceans / later lakes): PPTX fill, PDF fill, and the entire
post-send layer (e-sign, open/view analytics, optional/upsell line items,
accept-and-pay). The user's ask stops at "proofread before sending," so the draft
is the deliverable and the post-send layer is explicitly out of v1.

## Increment roadmap
See `roadmap.md`. Each increment is its own Kiro spec under
`_specs/proposal-autodraft/PROPOSAL-00N/` and is built + evaluated before the next.
PROPOSAL-001 (this spec set) is the foundation: ingest a DOCX template, detect its
components with an LLM, let the user confirm once, persist a reusable mapped
template. No DOCX mutation yet — that is PROPOSAL-002.

## Key risks / decisions carried into the specs
- **Un-tagged templates:** docxtemplater fills *tagged* docs; a customer template
  is prose. Decision: 001 only *detects and maps* (records section headings/anchors
  + offsets + suggested tokens). 002 does the templatize-and-fill via
  heading-anchored content replacement. Splitting here keeps the hard OOXML-write
  problem out of the foundation.
- **Storage:** default to a DB-blob store behind a `ProposalStorage` interface so
  001 is not blocked on provisioning a bucket; Supabase-EU / S3 are config swaps.
- **Trust is the product, not polish.** Without per-component confidence +
  citations + abstention, "proofread-only" is a lie. It lands in PROPOSAL-003 and is
  non-negotiable for v1 done-ness.
