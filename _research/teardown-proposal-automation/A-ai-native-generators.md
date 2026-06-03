# Cluster A — AI-Native Proposal & Deck Generators

**Topic of the audit:** software that auto-drafts a commercial proposal from (a) a customer-provided template and (b) an information base, so the user only proofreads before sending.

**Companies in this cluster:** Qwilr, PandaDoc, Storydoc, Gamma, Tome, Plus AI, Decktopus, Beautiful.ai.

**Date:** 2026-06-03. Sources: vendor pricing/feature/help pages where possible (primary), plus a few review aggregators for pricing cross-checks.

---

## TL;DR — the one distinction that matters for us

The question "ingest a customer's OWN template and auto-fill/rewrite each component, preserving exact layout" splits this cluster cleanly into two camps:

| Camp | What "import a template" actually means | Tools |
|---|---|---|
| **Preserve-the-template (fill-in-the-blanks)** | Keeps the customer's exact slide/doc layout as-is; AI only swaps text/images inside existing placeholders. Closest to our use case. | **Plus AI (Custom Templates beta)**, **PandaDoc (Smart Content / variables + tokens)** |
| **Extract-brand, regenerate house style** | Pulls colors/fonts/logos (the *brand*), then re-authors content into the tool's OWN interactive templates/cards. Layout is theirs, not the customer's. | **Storydoc**, **Gamma (Theme Importer)**, **Qwilr (AI Creator)**, **Decktopus**, **Beautiful.ai (Smart Slides)**, **Tome** |

**Nobody in this cluster does the full target job well** = take a customer's bespoke proposal template *and* a rich information base, and auto-write every section in the customer's exact layout with proofread-only output. The closest mechanics are **Plus AI's Custom Templates** (true layout-preserving AI fill, but Google-Slides-only, ≤25 slides, no charts/tables) and **PandaDoc Smart Content** (true layout preservation, but it's rule/variable templating + a writing-assistant, NOT a "draft the whole proposal from a brief" engine).

---

## 1) Qwilr (incl. AI Creator)

**Positioning / target user.** Interactive web-page proposal software for sales teams (professional services, SaaS, hospitality, manufacturing, energy). Proposals are *web pages*, not documents. Launched a standalone "AI Proposal Creator" in 2025.

**Core features.**
- Editor model: **web-page builder** (responsive interactive pages, embedded video, ROI calculators).
- Template library (Qwilr's own block-based templates).
- **Interactive quote tables / pricing plans** (toggleable options, quantities) — a genuine strength; pricing is dynamic, not a static table.
- **E-signature + document acceptance** built in.
- **QwilrPay** (collect payment in-page; 0.09% fee on Business, 0.05% on Enterprise).
- **Engagement analytics**: view/click/share notifications.
- CRM: HubSpot, Pipedrive, Zoho (Business); Salesforce (Enterprise).

**HOW THE AI WORKS.** **AI Creator** flow: *Enter your website URL → pick one of 5 industries (+ optional sub-industry) → optionally add a prompt about the prospect/offering → AI generates a full Qwilr page.* It "scans your website to understand your business, offering, messaging and design style" and "builds a tailored page using best practices from over 1+ million proposals." Free standalone tool (no account needed to generate; account needed to edit/send). Input = URL + industry + short prompt. Output = a complete multi-section Qwilr page draft.

**Fidelity to source.** **Generates its OWN house style.** It infers your aesthetic from your website but the output is a "new Qwilr-native creation" using "Qwilr's proprietary design framework." It does **not** ingest or preserve a customer-supplied proposal template/Word/PPT. So: brand-flavored, not template-faithful.

**Pricing.** Business **$35/user/mo** annual ($39 monthly), 1 user incl., e-sign + quote tables + analytics + HubSpot/Pipedrive/Zoho, 120-day history. Enterprise **$59/user/mo** annual (10-user min): custom branding/domains, Salesforce, identity verification, 5-yr history, lower QwilrPay fee. AI Creator is free; broader AI bundled (pricing for AI add-on not separately published).

**Strengths.** Best-in-cluster interactive pricing/quote experience; native e-sign + payment + analytics; fast URL→draft.
**Weaknesses / gaps.** Output is a web page (not a Word/PDF deliverable buyers may expect); cannot honor a customer's exact existing template; AI grounded only on website, not a deep info base / past-proposal corpus.

Sources:
- https://qwilr.com/ai-creator/
- https://qwilr.com/pricing/
- https://qwilr.com/welcome/proposal-generator-software/
- https://finance.yahoo.com/news/qwilr-launches-ai-proposal-creator-120000124.html

---

## 2) PandaDoc (esp. "PandaDoc AI" / Smart Content)

**Positioning / target user.** Document-automation + e-signature platform for sales/RevOps teams. The most "proposal/contract document"-native tool in the cluster (closest analog to what a B2B seller actually sends).

**Core features.**
- Editor model: **document** (proposals, quotes, contracts) with content blocks.
- Large template library + reusable **Content Library** blocks.
- **Pricing/quote tables** with line items, taxes, discounts, optional/editable quantities; product catalog.
- **E-signature** (core product), approval workflows, audit trail.
- **Engagement analytics**: time-on-page per section, opens, etc.
- Deep CRM sync (Salesforce, HubSpot, Pipedrive, etc.) to auto-populate fields.

**HOW THE AI WORKS — two distinct mechanisms, important to separate:**
1. **Smart Content (rule-based templating, NOT generative).** You build a template with **variables/placeholders** ("Hello, [NAME]"), **tokens**, and **conditional content** (rules decide which blocks/clauses/pricing appear based on CRM fields like company size, industry, jurisdiction). At generation time PandaDoc swaps variables for customer-specific values and toggles conditional blocks. This *assembles* a personalized doc from a pre-built template — deterministic, not LLM-written.
2. **PandaDoc AI / AI Assistant (generative).** A writing assistant: drafts/refines copy, suggests wording, rewrites for an audience, explains pricing/product/disclaimers, drafts the send email. Also an **AI document chatbot** to Q&A across docs ("what discount did we give this customer?", "which contracts expire next quarter?").

So the realistic flow today is: **human builds the template with variables/conditional logic → CRM data + Smart Content auto-fills the structured parts → AI Assistant helps draft/rewrite the prose blocks → human proofreads.** There is no single "type a brief, get a finished proposal in your template" button; it's templating + assistant, not autonomous drafting.

**Fidelity to source.** **Preserves template structure exactly** — Smart Content "maintains template structure and formatting." This is the *opposite* of the deck tools: the layout is fixed and authoritative; AI/data only fill defined slots. **But** the template must be (re)built inside PandaDoc with variables; it does not ingest an arbitrary customer Word/PPT and auto-detect where to write. (Note: a competitor blog, llemental.com, explicitly markets "AI proposal automation that preserves your templates" *as a gap vs PandaDoc* — i.e. third parties see PandaDoc's template-fill as not fully automated.)

**Pricing.** Free (5 docs/mo, limited). Essentials **$19/seat/mo** annual ($35 monthly) — unlimited docs, e-sign, templates. Business **$49/seat/mo** annual ($65 monthly) — custom branding, CRM integrations, approval workflows, content library, Smart Content. Enterprise custom (advanced automation, security). Extra: ~$5/doc for API/programmatic generation; branding removal needs Business+.

**Strengths.** Most template-faithful + most "real proposal/contract" oriented; e-sign + analytics + CRM auto-fill are mature; conditional logic is powerful for compliant, varied proposals.
**Weaknesses / gaps.** Smart Content requires up-front template engineering (variables, rules) — setup burden; the generative AI is an *assistant*, not an end-to-end drafter from a brief + info base; per-doc API fees; per-seat costs climb.

Sources:
- https://www.pandadoc.com/features/create/smart-content/
- https://www.pandadoc.com/features/ai-assistant/
- https://www.pandadoc.com/blog/creating-dynamic-document-templates/
- https://www.docupilot.com/blog/pandadoc-pricing
- https://llemental.com/posts/pandadoc-alternative-ai-proposal-automation (3rd-party, gap framing)

---

## 3) Storydoc

**Positioning / target user.** AI maker of **interactive, web-based** decks/business docs (pitch decks, one-pagers, proposals, sales decks). Sells "static slides → engaging interactive deck." Sales/marketing audience.

**Core features.**
- Editor model: **interactive web "story doc"** (scrollytelling cards), not slides or Word.
- Narrative-structured template library (proposals, case studies, one-pagers).
- Interactive blocks: animated/scroll-triggered reveals, embedded video, live data charts, forms.
- Analytics + CRM integrations (Pro tier+: HubSpot/Salesforce).
- E-sign: lighter than PandaDoc/Qwilr; primarily an engagement/tracking play.

**HOW THE AI WORKS.** Three entry points: *start from a template, **import existing slides**, or generate with AI.* Import path: upload PPT / PDF / Keynote / Slides / Canva / Word **or paste a link/website** → Storydoc **"automatically extracts your key visuals — graphics, colors, fonts, logos, images"** so the result "immediately feels yours." There's also a **design-studio service** where Storydoc's team redesigns your static collateral into an interactive deck.

**Fidelity to source — KEY FINDING.** **Does NOT preserve the original layout 1:1.** It extracts the *brand* (colors/fonts/logos/images) and **re-authors content into Storydoc's own interactive templates** ("layout templates… header, problem overview, big numbers, timelines, product descriptions"). Explicitly "fundamentally a redesign, not a conversion." So: brand carries over, layout/structure becomes Storydoc's.

**Pricing.** Starter **$19/mo** monthly ($237/yr) — 20 AI image + 25 AI text credits, basic analytics, limited slides/templates. Pro **$36/mo** monthly ($432/yr) — 50 image + 125 text credits, extended analytics, unlimited slides/templates, **CRM integrations gated here**. Teams custom.

**Strengths.** Slick interactive output + strong tracking; brand auto-extraction makes drafts feel on-brand fast.
**Weaknesses / gaps.** Output is web-only interactive (not a faithful PPT/Word the customer can hand off); cannot reproduce a customer's exact template; AI credits are metered (text credits low on Starter); not a contract/e-sign tool.

Sources:
- https://www.storydoc.com/upload-deck
- https://www.storydoc.com/proposal-maker
- https://www.storydoc.com/pricing
- https://checkthat.ai/brands/storydoc/pricing

---

## 4) Gamma

**Positioning / target user.** Mass-market AI presentation maker + website/doc builder ("card" format). Broad SMB/individual audience; not proposal-specialized.

**Core features.**
- Editor model: **cards** (flexible blocks, between slides and a doc/webpage).
- Generate from prompt, paste text, or **import a file**; export to PDF/PPTX.
- **Theme Importer**: import a PPTX or Google Slides → Gamma auto-extracts brand **colors, fonts, logos** and builds a reusable custom theme.
- Custom fonts, brand kit (Pro), per-viewer analytics (Pro), password protect, custom domains, API (Pro).

**HOW THE AI WORKS.** Prompt/outline → Gamma generates cards; or **import .pptx/Slides** → converts into Gamma's card format (it warns the rigid slide format "does not always map perfectly to Gamma's fluid card format" and may need layout adjustments). Theme Importer is for *brand extraction*, not layout cloning. No PDF/Word upload to the custom-theme workspace (PPTX/Slides only).

**Fidelity to source.** **Extracts brand, regenerates in Gamma's card layout.** Imported decks are reflowed; the Theme Importer reproduces *style* (palette/fonts/logo), not the original slide geometry. Not template-faithful.

**Pricing.** Free (with limits). Plus **$8/mo** annual ($10 monthly), 1,000 credits/mo (~25 decks), removes branding, basic brand kit. Pro **$15/mo** annual ($20 monthly), 4,000 credits, premium models, custom fonts, password, headers/footers, up to 10 custom domains, per-viewer analytics, API. Ultra/Enterprise above.

**Strengths.** Cheapest, fastest "prompt→deck"; broad export; decent brand-theme matching.
**Weaknesses / gaps.** No proposal/quote/e-sign primitives; card format means you can't guarantee a customer's exact template; consumer-grade for B2B sales proposals.

Sources:
- https://gamma.app/
- https://help.gamma.app/en/articles/11029150-can-i-add-my-own-colors-and-fonts-to-gamma
- https://flowith.io/blog/gamma-app-pricing-2026-free-vs-plus-vs-pro/
- https://dicloak.com/blog-detail/how-to-make-branded-presentations-with-ai--import-your-brand-into-gamma

---

## 5) Tome

**Positioning / target user.** **Pivoted.** The original Tome AI presentation editor was **shut down on 2025-04-15**. Tome now positions as an **AI-native sales research + deck-personalization platform** for sales/marketing — automating account research and tailoring decks per prospect.

**Core features (current).**
- AI sales research → account-specific deck personalization.
- Narrative-driven "story docs" (GPT-4 text + DALL·E 3 images historically), composition-aware layouts, mobile-responsive.
- Drag-and-drop prompt iteration.
- Not a proposal/quote/e-sign tool.

**HOW THE AI WORKS.** Research the account → generate/personalize a narrative deck for that prospect. Less "fill my template," more "auto-build a tailored pitch from research." Emphasis on emotional arc/storytelling, not document fidelity.

**Fidelity to source.** Generates its **own** narrative/house style; not designed to preserve a customer's exact template. Brand/template ingestion is not the product's focus post-pivot.

**Pricing.** Professional **$16/mo** (annual); Enterprise ~**$7,200/yr for 10 users** (≈$60/user/mo).

**Strengths.** Strong AI research → personalized-pitch angle for outbound sales decks.
**Weaknesses / gaps.** Product discontinuity/uncertainty after the 2025 shutdown/pivot; no e-sign/quote/proposal-contract layer; not template-faithful; least relevant to "fill my proposal template."

Sources:
- https://www.tooljunction.io/ai-tools/tome
- https://magical-tome.vercel.app/lp/ai-presentations
- https://onyxranked.com/tome-ai-review-2026/

---

## 6) Plus AI

**Positioning / target user.** AI add-in that lives **inside Google Slides and PowerPoint** (also standalone). Pitch: "stop making slides the old way." Business users who want to stay in their existing slide tool + enforce brand.

**Core features.**
- Editor model: **native Google Slides / PowerPoint** (you keep your real deck).
- Generate from prompt or **upload a file**; then **Insert / Remix / Rewrite** individual slides.
- **Custom branding** (logos on title/footers, brand colors, fonts auto-applied).
- **Custom Templates (beta)** — see below.
- Enterprise: Plus team hand-builds fully custom templates that become the foundation for all AI generation.

**HOW THE AI WORKS — KEY FINDING (closest to our target mechanic).** **Custom Templates (beta):** Plus AI > New Presentation > Custom templates → name + describe → select a Google Slides file → import (1–2 min). Plus copies your file, then **"uses the slides in your template as-is — Plus AI will not redesign your slides or add new slide types."** AI then **populates text-only and text-with-image slides while preserving layout and styling**, usable for *generating a full presentation, inserting single slides, or remixing*. This is genuine **layout-preserving AI fill** of the customer's OWN template.
**Stated limitations:** Google Slides only (PowerPoint "coming soon"); **max 25 slides/template, max 5 templates/team**; **charts, native tables, diagrams, Gantt, comparison matrices import as STATIC** (AI can't update them); best results require "each distinctly formatted piece of text in its own text box"; requires Team plan minimum.

**Fidelity to source.** **Highest template fidelity in the cluster** for AI-generated output: it explicitly keeps the customer's exact layout/styling and only fills supported text/image elements — does not impose a house style. The trade-off is the hard limits above (slide count, no charts/tables, Slides-only).

**Pricing.** Subscription (Pro/Team/Enterprise); Custom Templates gated to **Team** tier; Enterprise gets bespoke template services. (Public per-seat figures vary by source; Team is the relevant gate for template-preserving AI.)

**Strengths.** The only mainstream tool that **AI-fills a customer's own template without redesigning it**; lives in the user's real PPT/Slides so the deliverable is a normal deck.
**Weaknesses / gaps.** Beta; Slides-only today; 25-slide/5-template caps; charts/tables/diagrams not auto-filled (a big limitation for data-heavy commercial proposals); no quote/e-sign/analytics layer (it's a slide tool, not a proposal-sending platform).

Sources:
- https://guide.plusai.com/ai-for-presentations/custom-templates-beta
- https://plusai.com/features/custom-branded-presentations
- https://guide.plusai.com/ai-for-presentations/custom-branding
- https://guide.plusai.com/ai-for-presentations/templates

---

## 7) Decktopus

**Positioning / target user.** Beginner-friendly AI presentation maker; "type a prompt → branded deck." SMB/individual.

**Core features.**
- Editor model: **slides** (drag-and-drop), opinionated auto-design.
- Generate 10–20 slide deck from a prompt (intro/body/conclusion/references), AI images, AI speaker notes.
- **Brand once** → decks auto-match your colors/fonts/logo.
- Import: prompt **or** upload up to 5 PDFs/Word/images; **PDF-to-presentation** conversion.
- Forms, voice-over, basic analytics.

**HOW THE AI WORKS.** Prompt or upload supporting docs (≤5) → AI determines flow/slide count/headlines → generates a full branded deck. PDF-to-presentation reformats a static PDF into editable slides. Uses ~30 AI credits per deck.

**Fidelity to source.** **Generates its own design**, then skins it with your brand kit (colors/fonts/logo). Uploaded docs are *source material*, not a layout to preserve. Not template-faithful.

**Pricing.** ~**$180–$420/yr** (annual tiers); ~30 AI credits per generated deck.

**Strengths.** Very low-friction prompt→branded deck; PDF→slides; cheap.
**Weaknesses / gaps.** Consumer-grade; no quote/e-sign/proposal-contract features; cannot reproduce a customer's exact template; shallow info-base grounding.

Sources:
- https://www.decktopus.com/
- https://help.decktopus.com/en/articles/35-create-your-presentation-with-decktogpt
- https://deckary.com/blog/decktopus-review

---

## 8) Beautiful.ai (DesignerBot)

**Positioning / target user.** AI presentation maker built on a **patented auto-layout (Smart Slides)** engine; business teams wanting consistently designed decks without manual formatting.

**Core features.**
- Editor model: **slides**, but every slide is a **Smart Slide** that auto-adjusts spacing/alignment/typography/hierarchy as content changes (300+ layout library).
- **DesignerBot**: generate a full deck from a prompt **or upload a document**; can create/modify individual slides.
- **March 2026 "Create with AI"** (Anthropic-powered): now produces a **text outline first** (structure/flow) before designing slides — outline-then-design workflow.
- **Brand Kit** (colors, fonts, logos, footers) propagated across decks; PowerPoint import/export; viewer analytics (Pro).

**HOW THE AI WORKS.** Prompt or doc upload → AI outline → DesignerBot lays content into Smart Slide templates shaped by the 300+ layout library → Brand Kit applies brand. The auto-layout engine *owns* arrangement; users pick a Brand Kit rather than the AI auto-detecting brand.

**Fidelity to source.** **Generates its own (Smart Slide) layouts.** Brand Kit enforces colors/fonts/logos, but the slide *structure* is Beautiful.ai's auto-layout, not a cloned customer template. Brand-faithful, not layout-faithful.

**Pricing.** No free plan. Pro from **$12/mo** (annual, individual) — unlimited slides, DesignerBot, PPT import/export, viewer analytics. Team **$40/user/mo**. Enterprise custom. 14-day trial (card required); all paid plans include unlimited AI generation.

**Strengths.** Best **auto-layout** quality in the cluster (slides always look clean as content changes); good brand enforcement; outline-first workflow improves structure.
**Weaknesses / gaps.** The very auto-layout strength means it **won't preserve a bespoke customer template** (it reflows into its own Smart Slides); no quote/e-sign/proposal layer; Team pricing climbs.

Sources:
- https://www.beautiful.ai/
- https://support.beautiful.ai/hc/en-us/articles/12885226948109-Creating-a-presentation-with-AI
- https://www.beautiful.ai/product-updates
- https://www.presentations.ai/blog/beautiful-ai-pricing

---

## Cross-cluster synthesis (for the PM audit)

**A. Two architectures, one fault line: "fill the customer's template" vs "extract brand, regenerate house style."**
- *Fill (layout-faithful):* **Plus AI Custom Templates** (AI fills your own slides as-is, no redesign) and **PandaDoc Smart Content** (variables/conditional blocks fill a fixed template). These match the audit's target behavior mechanically.
- *Regenerate (brand-faithful only):* **Storydoc, Gamma, Qwilr, Decktopus, Beautiful.ai, Tome** — all auto-extract colors/fonts/logos and re-author into their *own* templates/cards/Smart Slides. Convenient, but the customer's exact layout is lost.

**B. "Import a deck" almost always means brand-extraction, not layout-cloning.** Storydoc and Gamma both upload a PPT/PDF/Slides and pull *visuals*, then rebuild. Only **Plus AI** explicitly promises "use your slides as-is, we will NOT redesign." This nuance is the single most important finding: marketing copy ("import your template") overwhelmingly resolves to *theme import*, not *layout preservation*.

**C. Nobody combines (template fidelity) + (drafts the whole proposal from a brief + deep info base) + (proofread-only).** The two layout-faithful tools are weak on autonomous drafting (PandaDoc AI is an *assistant*; Plus AI fills text but can't touch charts/tables and caps at 25 slides). The strong autonomous drafters (Qwilr, Gamma, Beautiful.ai, Storydoc) sacrifice layout fidelity. **This gap is the opening for us.**

**D. Information-base grounding is shallow across the board.** Qwilr grounds on the customer's *website*; Tome on *account research*; the rest on the *prompt + uploaded source docs*. None ingest a structured, reusable company knowledge base (past proposals, pricing, case studies, product facts) as a first-class corpus to draft from. Another opening.

**E. The "proposal platform" features (quote tables, e-sign, payment, engagement analytics) live with the document-native tools, not the deck tools.** **PandaDoc** and **Qwilr** own interactive quote tables + e-sign + analytics (+ QwilrPay). Storydoc has analytics but light e-sign. The pure deck tools (Gamma, Plus AI, Decktopus, Beautiful.ai, Tome) have **no** quote/e-sign/send-and-track layer — so even when their drafting is good, they don't close the loop to "send to the prospect."

**F. Pricing ladder (rough, per user/mo annual unless noted).** Gamma $8–$15 · Beautiful.ai $12 (Team $40) · Tome $16 · Storydoc $19–$36 · PandaDoc $19–$49 (+~$5/doc API) · Qwilr $35–$59 · Decktopus ~$15–$35 · Plus AI (Team tier gates template-preserving AI). Deck tools are cheap; the proposal-platform tools (Qwilr/PandaDoc) cost more because they bundle e-sign/quote/analytics.

**Net read for the audit:** The market is split between *fast house-style generators* (most of the cluster) and *template-faithful fillers* (Plus AI, PandaDoc) — and the latter are either narrowly limited (Plus AI: Slides-only, 25 slides, no charts) or not truly generative (PandaDoc: templating + assistant). A product that ingests a customer's exact template **and** a real information base **and** auto-writes every component for proofread-only review would beat every tool here on the specific job the audit describes.
