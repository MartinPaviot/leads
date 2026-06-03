# Proposal Auto-Draft — Competitive & Product Audit

PM-grade audit for Elevay. Sources: the four cluster teardowns in this folder
(`A-ai-native-generators.md`, `B-rfp-response-automation.md`,
`C-templating-engines-technical.md`, `D-classic-proposal-cpq-esign.md`) plus the
live-codebase map. No hype: claims are tied to the cluster files; vendor-blog
mechanics are flagged as self-serving where used.

---

## 0. The job to be done

Actor model in Elevay: the **user is the seller** (founder doing founder-led
sales). The **prospect** is the user's potential customer.

The request: *"draft a commercial proposal automatically from an information base
about the prospect, by filling a template (Word / PowerPoint / PDF) component by
component, so the user only proofreads before sending."*

Two input modes that collapse into **one pipeline**:

- **Mode 1 — the seller's own template.** User uploads their standard propale
  (their format, their brand). Elevay fills every component from what it already
  knows about this prospect. This is the default and the 80% case.
- **Mode 2 — a buyer-imposed template / RFP.** The prospect hands over a required
  response format or questionnaire. Same pipeline, different template source.

The architecture does not need to fork: "ingest a template → map its components →
fill each from the info base → proofread → export in the original format" serves
both. The only difference is where the template comes from.

**Scope boundary (important):** the explicit ask stops at *"proofread before
sending."* The DRAFT is the product. The send / e-sign / track / pay layer
(Cluster D) is a later, optional extension, not part of v1.

---

## 1. Market map

### Cluster A — AI-native proposal & deck generators
Qwilr, PandaDoc AI, Storydoc, Gamma, Tome, Plus AI, Decktopus, Beautiful.ai.

- The cluster splits on one fault line: **"fill the customer's template"** vs
  **"extract brand, regenerate a house style."**
- "Import your deck / template" almost always means **theme extraction** (colors,
  fonts, logo), **not** layout preservation. Storydoc calls its upload "a
  redesign, not a conversion"; Gamma reflows into its own cards; Qwilr scans your
  *website* and builds a Qwilr-native page.
- **Closest to true fill: Plus AI "Custom Templates"** — explicitly *"uses the
  slides as-is, will not redesign."* But: Google Slides only, ≤25 slides / 5
  templates, and **charts / native tables / diagrams import as static** (AI can't
  fill them) — fatal for data-heavy commercial proposals. No quote/e-sign.
- **PandaDoc** preserves structure but via **rule-based templating** (variables,
  tokens, conditional blocks from CRM), not generative drafting; the template
  must be (re)built inside PandaDoc. Its "PandaDoc AI" is a writing assistant.

### Cluster B — RFP / bid response automation (the closest existing pattern)
Responsive (ex-RFPIO), Loopio, AutogenAI, Arphie, QorusDocs, Ombud, Rohirrim, GovDash.

Every serious vendor implements a version of the **canonical pipeline**:

> upload doc → detect/segment components → retrieve from knowledge base →
> auto-fill / generate → score + cite → human review → export preserving structure

Trust stack worth stealing wholesale:
- **Per-answer confidence + triage** (Arphie High/Med/Low) — the single most
  important feature for a "proofread-only" promise; sends the reviewer to the
  risky parts first.
- **Abstention** — refuse to fabricate when no good source exists (Arphie), vs
  legacy tools that return a bad library match.
- **Clickable citations to the exact source** (which doc/page) — Loopio's
  inability to always link back is the cautionary tale.
- **Draft self-scoring** on multiple axes (Responsive **TRACE** =
  Transparency/Relevance/Accuracy/Completeness/Ethics).
- **Freshness as architecture** — live-source RAG (Arphie/Conveyor) eliminates the
  ~200–250 hrs/yr library-maintenance burden that plagues Loopio/Responsive.

**Category-wide weak spot = export fidelity.** Loopio's #1 G2 complaint (72
reviews cite formatting); Responsive too. Nobody reliably does "upload their exact
template → get their exact template back, just filled."

### Cluster C — Templating engines (the technical "how")
Only **three** ways to fill a template and keep formatting:

1. **In-place token substitution inside the original file's XML** (DOCX/PPTX/XLSX
   are ZIP-of-XML / OOXML; you edit bytes that already carry styling, so format
   survives for free). → docxtemplater, docxtpl, docx-templates, Carbone, Adobe
   DocGen, Conga.
2. **Regenerate from scratch in code** (format = whatever you write). → docx
   (npm), PptxGenJS.
3. **Overlay / form-fill on a fixed canvas** (PDF only — PDFs don't reflow). Fill
   AcroForm fields or stamp text at (x,y), then flatten. → pdf-lib, Apryse.

Consequences:
- **DOCX/PPTX templating is a solved, mature problem. PDF "templating" is the hard
  one and is a different activity** (fill fields / stamp coordinates, not reflow).
- The universal fidelity trick: the author *styles the placeholder itself*; the
  engine only swaps the characters inside the already-styled run. Prerequisite is
  **run-gluing** (Word fragments `{{client_name}}` across runs → naïve regex
  fails). Every serious engine handles this; rolling our own does not.
- **PPTX gotchas:** `shape.text = "…"` destroys formatting (must edit the first
  run, keep `<a:rPr>`); **auto-fit `fontScale` is not recomputed on open** → long
  injected text overflows unless you recompute it.
- **PDF reality:** AcroForm fill needs the PDF to *have* fields; coordinate overlay
  means you own wrapping (pdf-lib does not reflow); for designed, variable-length
  PDFs the only sane path is **regenerate from a DOCX/HTML template**.

Ingesting an **un-tagged customer template** (the core problem) — four approaches;
recommended blend: **mark-once as backbone, LLM-detect as accelerator, regenerate
for variable PDFs.** Run an LLM over extracted text to *propose* placeholders +
map them to our schema as **human-confirmed suggestions** (cuts marking ~80%,
keeps a human in the loop). Never trust pure-LLM coordinate positioning in prod
(LLM = labeler/mapper/filter; geometry + human = positioner).

Cost reality: the whole Node OSS core (docxtemplater + pdf-lib + PptxGenJS/docx +
LibreOffice/Gotenberg for PDF render) is **$0**. Paid only for docxtemplater PRO
modules (image/html/slides — cheap), or Apryse/Nutrient if we need LibreOffice-free
high-fidelity Office↔PDF, plus the LLM API.

### Cluster D — Classic proposal + CPQ + e-sign + analytics
Proposify, Better Proposals, GetAccept, DealHub, Prospero, Nusii, Bidsketch,
Concord, Ironclad, DocuSign Gen/CLM.

Table stakes **if we ever extend past the draft into send/track**: template library
+ reusable snippets with variables; branded web-rendered proposal; in-doc pricing
tables with optional line items; **native e-sign, eIDAS-valid (mandatory for the
francophone wedge)**, audit trail; instant open/view notification; per-section
time analytics; viewed-but-not-signed signal + reminders; accept-and-pay; ≥1 CRM
sync; roles + locked content.

Win-rate levers actually backed by evidence:
- **Native e-sign → cycle speed** (Bidsketch: e-signed deals close 60% faster).
- **Buyer-toggleable optional/upsell line items → deal value** (Bidsketch: +32%
  revenue; same as Proposify interactive quoting).
- **Open-tracking + act-on-open follow-up → timing** (Proposify: 43% of proposals
  won within 24h of opening).
- Weak/unproven: scroll heatmaps (per-section *time* is the version people use);
  internal approval routing improves compliance, not conversion.

Defer: full CPQ approval engines and deal rooms (enterprise-shaped, low marginal
value for founder-led SMB deals).

---

## 2. Central finding — the unoccupied space

Map the field on two axes: **template fidelity** (does the output keep the user's
exact layout?) × **grounding** (is the content drafted from a real, prospect-
specific information base, or from a prompt / generic library?).

- AI deck tools (Gamma, Storydoc, Qwilr): low fidelity (regenerate house style),
  shallow grounding (prompt + website).
- PandaDoc: high fidelity (rule-based), but no generative drafting and grounding =
  CRM merge fields only.
- RFP tools (Loopio, Responsive, Arphie): real grounding (knowledge base) + the
  trust stack, but **weak export fidelity** and the library is generic, not
  prospect-specific, and rots without maintenance.

**No one occupies high-fidelity + deep prospect-specific grounding + proofread-only
+ format round-trip.** That is exactly the target.

### Elevay's unfair advantage
The competitors bolt a **generic knowledge library** onto the side. Elevay already
**captures the prospect-specific information base as a byproduct of normal use** —
emails, meetings, call notes, the deal record, company enrichment, the context
graph. "Fill from an information base" is the one thing Elevay is uniquely
positioned to do well, because the info base is **live, prospect-specific, and
already there.** Competitors can match the templating; they cannot match the
grounding without rebuilding Elevay's capture layer.

Second advantage: **chat-first surface with action-card approval** already exists,
so "draft this propale," per-component review, and "regenerate section 3 to
emphasize ROI" are native interactions, not a bolted-on editor.

---

## 3. The pipeline we build (mapped to the canonical model)

| Stage | What we do | Best-in-class reference |
|---|---|---|
| 1. Ingest | Upload .docx (v1), .pptx, .pdf. Store tenant-scoped. | Loopio SmartScan, GovDash shredding |
| 2. Detect components | LLM over extracted text proposes a **component map**: sections (Exec summary, Scope, Pricing, Timeline, About us…) + variable fields ({client}, {amount}, {date}). Human confirms once → reusable tagged template. | Mark-once + LLM-detect (Cluster C) |
| 3. Retrieve | Pull per component from Elevay's info base: deal, company, contacts, meeting notes, emails, skill knowledge, context graph. | Arphie live-source RAG |
| 4. Fill / draft | Generate content per component; substitute in-place via docxtemplater (formatting preserved). | docxtemplater + PandaDoc fidelity |
| 5. Trust | Per-component **confidence + abstention + citations** to the exact source interaction. | Arphie + Responsive TRACE |
| 6. Review | Proofread view: components sorted low-confidence-first; inline edit; regenerate per component. | Arphie triage |
| 7. Export | Filled .docx (v1); PDF via regenerate path. Round-trip = same template, just filled. | The category's weak spot = our wedge |

---

## 4. Technical stack decision (Node / TypeScript)

| Need | Use | Note |
|---|---|---|
| .docx fill (v1) | **docxtemplater** (free core) + PRO image/html | mature run-gluing, loops, free reflow; alt easy-template-x (MIT) |
| .docx text extraction for detection | **mammoth** / direct OOXML read | feed LLM the structured text for component detection |
| .pptx fill (later) | docxtemplater Slides PRO, or python-pptx first-run editing + recompute `normAutofit` | never `shape.text =` |
| .pdf form/contract (later) | **pdf-lib** fields → `updateFieldAppearances` → `flatten` | needs existing AcroForm fields |
| .pdf designed/variable (later) | **regenerate** from DOCX/HTML → render (LibreOffice/Gotenberg) | editing the original is a dead end |
| Storage | **Supabase Storage, EU region** | eIDAS / francophone data residency (consistent with FINDING-004 EU pinning) |
| LLM | existing `ai-provider.ts` (Claude Sonnet 4.6 / Haiku 4.5, EU endpoint) + `tracedGenerateObject` | reuse, add prompt caching |

Ingestion strategy: **mark-once backbone + LLM-detect accelerator + regenerate for
variable PDFs.** Format phasing: **DOCX → PPTX → PDF** (easiest, solved → hardest).

---

## 5. What we reuse vs build (from the codebase map)

**Reuse:** `lib/ai/ai-provider.ts`, `tracedGenerateObject` (structured output);
`getSkillKnowledge`, `getDeepConversationContext`, `getCompanyContacts` (info-base
retrieval); the **existing `draft-proposal` skill** (currently emits a house-style
proposal JSON — becomes our content-generation engine for stage 4); skill
registration (`register-all.ts`) + chat-tool wrapping (`buildSkillsTools`); the
`deals` / `companies` / `contacts` model (tenant-scoped, deal-split aware); chat
action-card approval flow.

**Build new:** `proposal_templates` + `proposals` tables (tenant-scoped); file
upload + Supabase EU storage; DOCX parse + component detection; in-place fill +
export; per-component confidence/citation/abstention; proofread/review surface.

**Conventions enforced:** no emoji in UI; brand "Elevay" not LeadSens; every query
tenant-scoped (anti-creep-pilae test); never sum `projectAmount` + `platformArr`
(use `getDealAmountDisplay`); no hardcoded tenant checks — read `tenant.locale`.

---

## 6. Recommendation — scope and phased roadmap

**v1 thesis:** faithful round-trip fill of the user's own **DOCX** template,
grounded in Elevay's already-captured prospect intelligence, with the trust stack
that makes "proofread-only" credible. Win on the two things the field cannot: 
**fidelity round-trip** + **prospect-specific grounding.**

Increments ("petit à petit"), each its own Kiro spec, built + evaluated then next:

- **PROPOSAL-001 — Data model + storage foundation.** `proposal_templates` /
  `proposals` tables, tenant-scoped; Supabase EU storage; upload endpoint; DOCX
  ingest + text extraction. (Foundational, no user value alone.)
- **PROPOSAL-002 — Component detection & mark-once mapping.** LLM proposes the
  component map from an un-tagged DOCX; user confirms once → reusable tagged
  template.
- **PROPOSAL-003 — Auto-draft fill from the info base.** Per-component retrieval +
  generation (extends `draft-proposal`); in-place docxtemplater fill → filled
  DOCX. First end-to-end value.
- **PROPOSAL-004 — Trust stack.** Per-component confidence + abstention +
  citations to the exact source interaction.
- **PROPOSAL-005 — Proofread / review UX.** Low-confidence-first triage, inline
  edit, regenerate-per-component, export. Chat-commandable.
- **PROPOSAL-006 — PPTX support.** In-place fill (first-run edit + autofit).
- **PROPOSAL-007 — PDF support.** Forms via pdf-lib; designed PDFs via regenerate.
- **Deferred (out of v1):** post-send layer — e-sign (eIDAS), open/view analytics,
  optional/upsell line items, accept-and-pay. Table stakes only if we extend past
  the draft into send.

---

## 7. Risks & open decisions

- **Fidelity ceiling on arbitrary customer templates.** Heuristic + LLM detection
  will miss some components; mitigated by the mark-once confirm step. Set
  expectation: first ingest of a new template needs a one-time human map; reuse is
  free.
- **PDF is structurally hard.** Don't promise PDF round-trip edit; offer
  regenerate-to-PDF instead. Phase it last.
- **Reuse vs replace `draft-proposal`.** Decision: **extend, not replace** — it
  becomes the stage-4 content engine; the new feature wraps ingest + map + fill +
  trust + review around it.
- **Where review lives.** Chat-first (action cards) for the command + a focused
  review surface for component-by-component proofreading. Resolve in PROPOSAL-005.
- **Trust is the product.** Without per-component confidence + citations, "proofread
  only" is a lie and the user re-checks everything. The trust stack is not optional
  polish; it is the feature.
