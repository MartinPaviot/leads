# Teardown D — Classic Proposal Software + CPQ + E-Signature + Engagement Analytics

Cluster: tools whose primary job is to **create, send, sign and track commercial proposals/quotes/contracts**.
Companies: Proposify, Better Proposals, GetAccept, DealHub, Prospero, Nusii, Bidsketch, Concord, Ironclad, DocuSign (Gen for Salesforce + CLM).

Date: 2026-06-03. Method: WebSearch + WebFetch only (no browser). Sources listed at bottom; pricing is "rough / publicly stated" and changes often.

> Framing note for our audit: this cluster splits into three sub-segments.
> 1. **SMB/freelance proposal builders** (Better Proposals, Prospero, Nusii, Bidsketch) — cheap ($13–49/mo), strong authoring + per-section tracking + e-sign, weak/no CPQ, weak CRM.
> 2. **Mid-market sales proposal + digital sales room** (Proposify, GetAccept) — proposal authoring + interactive quoting + engagement analytics + CRM sync; GetAccept adds deal rooms, video and CPQ.
> 3. **CPQ / CLM heavyweights** (DealHub, Ironclad, DocuSign CLM/Gen) — quote-to-contract, complex pricing, approval governance, legal-grade; proposal "look" is secondary to deal/contract correctness.

---

## 1. Proposify

**1. Positioning / target user.** Mid-market sales teams; "proposal software to streamline your sales process." Reps + sales ops, not just freelancers. Strong on brand-consistency governance.

**2. Authoring model.** Drag-and-drop editor; **Template Editor** for locked, on-brand templates reps reuse and personalize; **unlimited templates** on all plans; 250+ template gallery; **Content Library** for approved snippets (product descriptions, case studies, images, pricing); custom fields & variables for personalization; **AI proposal generator**.

**3. CPQ / pricing tables.** **Interactive Quoting** — buyers adjust quantities and toggle options/add-ons/tiers in real time, total recalculates live. **Pricing Library** centralizes approved prices to block unapproved discounts. **Embed Quotes** in multiple formats. Stripe (135 currencies) for collect-on-sign. Recurring vs one-time supported via fee types. Not a deep multi-dimensional CPQ engine (no usage-based pricebooks like DealHub).

**4. E-signature.** Native, legally binding, "compliant with strict e-signature laws around the globe." Multiple signees incl. unknown signee. 256-bit bank-grade encryption, SOC 2. Audit trail implied via tracking (open/sign timestamps).

**5. Engagement analytics.** Real-time **open notifications**; analytics on **time spent per section**; reporting on rep + process performance and pipeline; stat they cite: 43% of proposals won within 24h of open. Heatmap/scroll not explicitly documented.

**6. Approval / workflow.** **Approval workflows triggered by deal size and discount thresholds** (internal sign-off before send). **Content locking / locked elements** per role — lock the parts reps must not edit. Roles & permissions control edit/send.

**7. Integrations.** Salesforce (managed package, optional SSO), HubSpot (data sync), Stripe, Zapier, open API.

**8. Pricing (rough).** Starter ~$19, Premium ~$29, Enterprise ~$49 /user/mo (monthly billing; lower annual). CRM integrations, content locking and advanced permissions gated to higher tiers.

- **Strengths:** brand governance (locked templates/content), interactive quoting, approval rules tied to discount/deal-size, mature CRM sync.
- **Weaknesses / gaps:** no deal room / buyer collaboration space; no native video; CPQ shallow vs true CPQ; heatmap not documented; cheaper tiers strip CRM.

---

## 2. Better Proposals

**1. Positioning / target user.** SMBs, freelancers, agencies, consultants. "Budget-friendly full proposal builder." Lowest entry price in the set.

**2. Authoring model.** Interactive WYSIWYG editor (write/edit/remove, themes, background images); **content library**; templates; multilingual content; custom domain; password protection; user permissions; approval management.

**3. CPQ / pricing tables.** Admins can **define recurring pricing**; quote/pricing tables in-document. Optional line items / fee structures exist but it is light CPQ — no approval-matrix pricebooks. Integrated payment collection (Stripe, GoCardless, PayPal).

**4. E-signature.** Native, included on **all plans**. Type or draw name → algorithm generates a unique private key. **Court-admissible audit trail**: records signer email, IP, date/time. Encrypted, securely stored. Legally binding in EU (eIDAS / 2019 e-Sig Directive) and US (ESIGN 2000). Multiple/sequential signers supported. Unique encrypted, non-transferable client link.

**5. Engagement analytics.** Real-time notifications when a proposal is **opened, forwarded, printed, downloaded or signed**; **per-section tracking**; "industry-leading analytics." Good "viewed-but-not-signed" follow-up signal.

**6. Approval / workflow.** Approval management + user permissions for internal review; not a heavy conditional-routing engine.

**7. Integrations.** HubSpot CRM, Zoho, Stripe, PayPal, GoCardless, Basecamp, Trello, Zapier.

**8. Pricing (rough).** From ~$13/user/mo (annual) entry; mid/top tiers add features. E-sign on every plan is the headline value.

- **Strengths:** cheapest full builder with e-sign + per-section tracking; strong audit trail for the price; payment collection baked in.
- **Weaknesses / gaps:** thin CPQ; limited CRM depth; no deal room; not for complex multi-product quoting or governance.

---

## 3. GetAccept

**1. Positioning / target user.** AI-powered **Digital Sales Room** + proposal software for B2B sales teams; "from opportunity to signed deal." Mid-market → enterprise; Salesforce-centric. Strongest "engagement + buyer collaboration" story in the set.

**2. Authoring model.** Branded proposal authoring; **Sales Content Management** repository (find/share right content); pricing tables tailored to buyer. Video and personal messaging are first-class (differentiator).

**3. CPQ / pricing tables.** Dedicated **CPQ** product. Edit product specs; custom fields for product variations; auto-generated pricing tables; reps fetch product details from CRM into the pricing table; AEs adjust/negotiate price in real time. **Full CPQ = Enterprise+ only**; on lower plans the product library is **capped at 3 products**. CPQ is an **add-on on Professional**, included at Enterprise. Line-item/discount/tax/recurring mechanics not deeply documented publicly.

**4. E-signature.** Native, included at no extra cost. **ESIGN + UETA + eIDAS + GDPR + SOC 2** compliant. Custom signing order and approval rules per document.

**5. Engagement analytics.** Core strength: real-time insight into how prospects interact with proposals; instant updates on view / new stakeholder looped in / sign; **stakeholder mapping when content is forwarded** (surfaces hidden decision-makers); Mutual Action Plans for multithreading. Live deal data mirrored to Salesforce dashboards. Customer-reported outcomes: sales cycle −67%, +100% win rate (SalesScreen), 9x faster quoting. Per-section time / heatmap less explicitly documented than the SDR-style "who-viewed-what."

**6. Approval / workflow.** Signing order + approval rules on documents; pipeline auto-advance, auto-mark-won on signature, auto follow-ups when buyer revisits deal room.

**7. Integrations.** Salesforce (deep bi-directional — create/send/track inside SF, auto stage updates), HubSpot, Microsoft Dynamics 365, SuperOffice. CPQ pulls product data from CRM.

**8. Pricing (rough).** eSign ~$25/user/mo; **Professional ~$49/user/mo** (annual, 5-seat min ≈ $2,940/yr); **Enterprise custom (~$10K–$50K/yr)**. CPQ + unlimited AI + premium CRM (Salesforce/Dynamics) are add-ons that push real cost 20–60% higher on lower tiers.

- **Strengths:** best buyer-engagement + deal-room + multithreading + video; native e-sign; deep Salesforce sync; CPQ available.
- **Weaknesses / gaps:** real CPQ + premium CRM locked behind Enterprise/add-ons; pricing opaque and add-on-heavy; product library cap (3) cripples lower tiers for quoting.

---

## 4. DealHub

**1. Positioning / target user.** AI-powered **CPQ + CLM + subscription/usage billing + DealRoom**, no-code, for RevOps / mid-market & enterprise sales ops. This is a **revenue platform**, not a "pretty proposal" tool. Replaces spreadsheet pricing.

**2. Authoring model.** Proposal/quote generation is an **output of the quote engine**; version-controlled order forms; DealRoom is the buyer-facing branded space. Authoring is config-driven (questions adapt to deal context) rather than free-form design.

**3. CPQ / pricing tables (its core).** No-code guided selling; structured product catalog; **Adaptive Pricebook** with multi-dimensional pricing — **usage-based, tiered, fixed/subscription**; dynamic discounts, bundling, line-level customization; pricing **guardrails to protect margins**; discount matrices. Handles new business, renewals, co-terminations, expansions, amendments in one platform. Quote-to-contract with unified data model.

**4. E-signature.** Via integration / built-in eSign for execution (DocuSign integration noted); part of CLM module.

**5. Engagement analytics.** **DealRoom** digital sales room tracks buyer engagement; **Deal Desk Dashboard** for real-time pipeline/quote visibility. Engagement analytics exist but are deal-desk/RevOps-oriented, not heatmap marketing analytics.

**6. Approval / workflow (a strength).** **Automated approval workflows with parallel/concurrent flows**; one-click approvals; approval chains, pricing rules and discount matrices all **configurable without engineering**; stakeholders looped in before send when special pricing involved.

**7. Integrations.** Native: Salesforce, HubSpot, Microsoft Dynamics 365, Freshworks; plus DocuSign, Gong, Slack. Headless API quoting for self-service/e-commerce; partner/channel quoting.

**8. Pricing (rough).** Custom/quote-based, ~**$60–83/user/mo** (CIO Playbook). Tiers: CPQ+, CPQ+CLM, Quote-to-Revenue (modules: DealRoom, CPQ, Billing). Sits below Salesforce CPQ ($75–150) and well below Oracle CPQ ($240).

- **Strengths:** deepest pricing/CPQ engine, no-code approval governance, full quote-to-revenue, strong CRM coverage incl. Dynamics.
- **Weaknesses / gaps:** overkill + cost for SMB/founder-led; proposal aesthetics secondary; engagement analytics not the "view-tracking" kind; implementation heavier.

---

## 5. Prospero (goprospero.com)

**1. Positioning / target user.** Freelancers, agencies, small teams. "Business proposals 3x faster." Affordable, design-forward.

**2. Authoring model.** Templates + **pricing tables + reusable content blocks**; **variables** for client name/prices; **section library**; save sections/templates to content library; AI create/edit text and images; roles & permissions; team proposal-status visibility by role.

**3. CPQ / pricing tables.** Pricing tables with quick links to **integrated signing + payment**; one-click invoice + get paid. Light quoting — no approval matrices / multi-dimensional pricing.

**4. E-signature.** Native, hassle-free; sign from any device/browser; **type / draw / upload** signature. Captures device, **signature timestamp and IP**.

**5. Engagement analytics.** Counts how many times client opened proposal and **how long they viewed it**; email alert on first open; analytics include device, signature timestamp, IP. (Per-section depth lighter than Proposify/Better Proposals.)

**6. Approval / workflow.** Roles/permissions for team visibility; no heavy internal sign-off engine documented.

**7. Integrations.** FreshBooks, QuickBooks, Stripe, Pipedrive, Integromat/Make, Zapier.

**8. Pricing (rough).** Low-cost SaaS, 14-day free trial; plans roughly in the ~$10–20/user/mo range (tiered).

- **Strengths:** fast, cheap, good-looking proposals; payment + e-sign + analytics bundled; Pipedrive integration.
- **Weaknesses / gaps:** shallow CPQ; basic analytics; not for enterprise governance or complex CRM.

---

## 6. Nusii

**1. Positioning / target user.** Freelancers, agencies, small businesses (web design, video, SaaS, construction verticals). "Serious businesses use to win more." Simplicity-first.

**2. Authoring model.** Drag-and-drop sections; 9 starter templates (sector-tailored); **variables module** auto-fills client/company details; auto-save, full-screen, code view; **embed/upload video** (YouTube/Vimeo); multi-language.

**3. CPQ / pricing tables.** Basic pricing in-proposal; **no real CPQ** (no quantity/discount/optional-item engine surfaced). Quoting is presentation, not configuration.

**4. E-signature.** Native electronic signatures included; "all-in-one e-signature."

**5. Engagement analytics.** Notification when someone **opens, accepts, or signs**; proposal tracking; **automated/custom reminder intervals**; reporting. Per-section/heatmap not surfaced.

**6. Approval / workflow.** User management; no documented internal approval-routing engine.

**7. Integrations.** Zapier-centric; integrates with common CRMs/invoicing via Zapier (lighter native CRM depth).

**8. Pricing (rough).** Freelancer $29/mo (1 user, 5 active proposals); Agency $49/mo (unlimited users, 20 active); Business $129/mo (unlimited users, 50 active). Note: tiers cap **active proposals**, not seats.

- **Strengths:** dead-simple, reminders, video embeds, predictable flat pricing.
- **Weaknesses / gaps:** no CPQ; active-proposal caps; thin analytics; light native integrations.

---

## 7. Bidsketch

**1. Positioning / target user.** Freelancers, designers, consultants, small agencies. Veteran, low-cost, "proposals in minutes." (Mature but dated product.)

**2. Authoring model.** Reuse **templates, pricing items, content, and designs**; mix/match content sections; custom **client landing page**; branded proposals.

**3. CPQ / pricing tables.** Reusable **pricing items**; **optional line items** the client can add — and option to auto-include them as part of the document (upsell). They cite optional-fees feature → +32% revenue on avg. Still SMB-light, not configurable CPQ.

**4. E-signature.** Native electronic signature on approval (client signs online); PDF export alternative. Cite: e-signed deals return 60% faster than PDF.

**5. Engagement analytics.** Instant **open notifications**; see **how long a client viewed**, which email they came from, whether they exported to PDF. Cite: proposals approved 18% more than traditional.

**6. Approval / workflow.** Client-side approval/sign; minimal internal sign-off tooling.

**7. Integrations.** HubSpot CRM, FreshBooks, Harvest, Insightly, Formstack Documents, Zapier, Wufoo.

**8. Pricing (rough).** Starter ~$15, Solo ~$23, Team ~$47, Business ~$119 (yearly). 14-day trial.

- **Strengths:** cheap, fast, **optional/upsell line items** (real win-rate lever), client landing pages.
- **Weaknesses / gaps:** aging UX; basic analytics; no deal room; light CRM; no CPQ governance.

---

## 8. Concord

**1. Positioning / target user.** **CLM** (contract lifecycle management) for mid-market; "deploy in 1 day." Business-user-friendly contracts, not sales-proposal aesthetics. Cost-predictable (unlimited e-sign).

**2. Authoring model.** Contract **templates**, repository, redlining, real-time collaboration, full-text search, clause/version control. AI Copilot + extraction on all plans. Document-centric, not designed "proposal pages."

**3. CPQ / pricing tables.** Not a CPQ. Pricing/commercial terms live as contract fields/clauses; no quote configurator, no discount matrices.

**4. E-signature.** **Unlimited native e-signatures on every plan, no per-doc/per-signature fees** (key differentiator). Bank-level encryption; compliant with **ESIGN, UETA, GDPR**; audit trails included.

**5. Engagement analytics.** Contract-ops analytics: status, reminders, renewals, basic reporting. Not buyer view-tracking/heatmaps.

**6. Approval / workflow (a strength).** **Conditional approval workflows** routing before signature: **risk-based routing** (high-risk → senior counsel), **value thresholds** (approval level by contract value), regulatory triggers (e.g., HIPAA). Drag-and-drop, no IT. Locked/controlled sections via permissions.

**7. Integrations.** Salesforce (Pro+), plus standard CLM connectors; custom fields.

**8. Pricing (rough).** Standard ~$17/user/mo (unlimited e-sign, templates, negotiation, basic reporting); Pro ~$49/user/mo (advanced workflows, Salesforce, custom fields); Enterprise custom. (Marketing also cites plans "from $499/mo" bundles.)

- **Strengths:** unlimited e-sign at low cost; real conditional approval governance; fast deploy; audit trails.
- **Weaknesses / gaps:** not a proposal/quote tool — no CPQ, no engagement analytics, no design polish; aimed at contracts post-agreement.

---

## 9. Ironclad

**1. Positioning / target user.** Enterprise/legal **AI CLM**. Legal + sales ops at scale; deep Salesforce. Governance + risk + AI redlining, not proposal design. Top-tier (Gartner-recognized).

**2. Authoring model.** **Workflow Designer** — upload existing Word contract templates, build rules/workflows around them; **Google-Docs-style real-time collaboration + redlining** (praised); native AI redlining/insights; centralized contract data/repository.

**3. CPQ / pricing tables.** Not CPQ. Commercial terms handled inside contract workflows; integrates with CRM/CPQ upstream rather than configuring quotes itself.

**4. E-signature.** **Native e-signature fully embedded** in the CLM (no third-party needed).

**5. Engagement analytics.** Contract analytics, full contract visibility, centralized reporting for decisions at scale; AI extraction/insights. Not buyer-side proposal view-tracking.

**6. Approval / workflow (core strength).** Approval workflows + **conditional logic** per template; assign approvals, loop stakeholders, no-code; granular controls. Strong governance/locking.

**7. Integrations.** Deep Salesforce (AppExchange managed package), broad enterprise integrations; AI Assist + advanced analytics as add-on modules.

**8. Pricing (rough).** Custom annual, sales-led, no public list. Typical ACV ~$30K–$250K+; mid-market often $50K–$120K/yr. AI Assist / advanced analytics add 15–40% uplift.

- **Strengths:** best-in-class no-code workflows + redlining + native AI + e-sign; enterprise governance/visibility.
- **Weaknesses / gaps:** expensive, legal-led, long implementation; not a proposal/CPQ tool for founder-led sales; overkill for SMB.

---

## 10. DocuSign — Gen for Salesforce + CLM

**1. Positioning / target user.** Two products around the DocuSign e-sign core. **Gen for Salesforce** = doc/agreement generation from Salesforce data for sales teams. **CLM** = enterprise contract lifecycle. Buyers already standardized on DocuSign e-sign.

**2. Authoring model.** **Gen**: auto-generate customized agreements/proposals/NDAs by merging Salesforce customer + **product + pricing** data (and AI prompts on deal records) into templates. **CLM**: template library, clause library, generation, workflow.

**3. CPQ / pricing tables.** Gen pulls **pricing tiers/terms from Salesforce fields** (and from SF Quotes/CPQ objects) into documents — it **consumes** CPQ data, it is not a configurator itself. Best paired with Salesforce CPQ upstream.

**4. E-signature.** The category-leading **native e-signature** (the core product). Strong legal validity (ESIGN, UETA, eIDAS), envelopes, certificate of completion / audit trail.

**5. Engagement analytics.** E-sign envelope tracking (sent/viewed/signed, audit certificate). Gen/CLM add agreement analytics + AI extraction. Not a buyer-engagement heatmap tool like GetAccept.

**6. Approval / workflow.** **CLM**: robust approval workflows triggered by Salesforce Opportunity stage; collaborative redline with suggested revisions, AI risk-flagging, Chatter/email threads, compliance-rule checks. **Gen** is lighter (generation + send).

**7. Integrations.** Deep Salesforce (Gen + CLM AppExchange), Microsoft, broad API ecosystem; the default e-sign others integrate with (DealHub, Better Proposals' alt, etc.).

**8. Pricing (rough).** E-sign plans anchor it: Personal ~$120/yr; Standard ~$300/user/yr; Business Pro ~$480/user/yr (advanced Gen tools); Gen for SF roughly ~$25–50+/user/mo as add-on; **CLM enterprise custom (typically high 5–6 figures/yr)**, seat- + envelope-based.

- **Strengths:** gold-standard e-sign + legal validity + audit certificate; Gen merges SF/CPQ/pricing data; enterprise CLM workflows.
- **Weaknesses / gaps:** no native CPQ engine; no engagement/view analytics for proposals; Gen needs Salesforce; pieced together across products + add-ons; pricing complex.

---

# Cross-cluster synthesis

## A. Table-stakes — what ANY serious proposal tool must have (our baseline)
Every credible player in segments 1–2 ships all of these; if Elevay lacks any, it looks toy:

1. **Template library + reusable content/snippets** (content library) with **variables/merge fields** (client name, price, dates) for fast personalization. (All 10.)
2. **Branded, web-rendered proposals** (not just PDF) — custom branding/domain, responsive viewer. (All proposal players.)
3. **Pricing tables / line items** in-document with at minimum optional line items and recurring-vs-one-time. (Proposify, Better Proposals, Prospero, Bidsketch; GetAccept/DealHub go deeper.)
4. **Native e-signature**, legally valid (**ESIGN/UETA** US, **eIDAS** EU), with an **audit trail** capturing signer email + IP + timestamp. (Better Proposals, GetAccept, Concord, DocuSign, Proposify, Prospero, etc.) — table stakes now, not a differentiator.
5. **Open/view notification** the instant a prospect opens the proposal. (All.)
6. **Basic view analytics**: how many times opened + total time viewed; ideally **per-section time**. (Better Proposals & Proposify lead; Prospero/Bidsketch basic.)
7. **"Viewed-but-not-signed" follow-up signal** + reminders (manual or automated). (Nusii reminders, Better Proposals forwarded/printed alerts, all open-tracking.)
8. **Accept + pay on signature** (Stripe/PayPal) — expected in SMB segment. (Better Proposals, Prospero, Bidsketch, Proposify.)
9. **At least one real CRM sync** (HubSpot and/or Salesforce/Pipedrive), bi-directional status push. (Proposify, GetAccept strong; SMB tools lean on HubSpot + Zapier.)
10. **Roles/permissions + locked content** so reps can't break brand/pricing. (Proposify content-locking is the bar; everyone has roles.)

## B. Which POST-SEND capabilities actually move win-rates (per the evidence)
The vendor-cited numbers are self-serving but directionally consistent, and they cluster on a few levers:

**Strongest evidence — these move the needle:**
- **Speed-to-sign via native e-sign vs PDF.** Bidsketch: e-signed deals return **60% faster**; GetAccept claims sales cycles **−67/−75%**. Faster signature = fewer deals lost to delay. *This is the single most-repeated win-rate lever.* (But it's now table stakes, so it's a floor, not an edge.)
- **Optional / upsell line items the buyer can toggle.** Bidsketch: optional-fee proposals earn **+32% revenue**; Proposify's interactive quoting (buyer adjusts qty/options live) is the same lever. Concrete, repeatable, and **directly raises deal value** — a high-ROI, low-build feature.
- **Open-tracking + per-section time → timely follow-up.** Proposify: **43% of proposals won within 24h of opening** — the value is acting on the open signal fast. "Viewed-but-not-signed" + which section got attention drives the right follow-up. Strong, cheap lever.

**Real but heavier / situational:**
- **Buyer engagement signals beyond open** — stakeholder mapping when a proposal is **forwarded** (GetAccept) surfaces hidden decision-makers and enables multithreading; correlated with higher win rates in complex B2B, less relevant for founder-led SMB deals.
- **Deal rooms / mutual action plans** (GetAccept, DealHub DealRoom) — help in multi-stakeholder, longer cycles; overkill for small founder-led deals.
- **CPQ depth (approval rules, guardrails, multi-dimensional pricing)** (DealHub, GetAccept Enterprise) — prevents margin leakage and quote errors at scale; **win-rate impact is via fewer errors/faster turnaround**, not buyer persuasion. Mostly matters once deals are complex/multi-product.

**Weak / unproven as a win-rate driver:**
- **Scroll heatmaps** specifically — frequently marketed, but none of these vendors tie heatmaps to a hard win-rate number; per-section *time* is the version that actually gets used.
- **Internal approval governance** (Concord/Ironclad conditional routing) — improves compliance/risk and cycle predictability, **not** buyer conversion.

## C. Implication for Elevay (founder-led, chat-first, francophone wedge)
- Baseline to not look toy: templates+variables, branded web proposal, line-item pricing with **optional/upsell toggles**, native e-sign (eIDAS + ESIGN, audit trail w/ IP+timestamp), instant open notification, per-section view time + "viewed-not-signed" nudge, pay-on-sign, HubSpot/Pipedrive sync, locked content.
- Highest win-rate ROI for the build effort: **native e-sign (cycle speed)** + **buyer-toggleable optional/upsell line items (deal value)** + **act-on-open follow-up signals (timing)**. These three are where the evidence is strongest and the build is cheapest.
- Defer/segment: full CPQ approval engines and deal rooms (DealHub/GetAccept/Ironclad territory) — heavy, enterprise-shaped, low marginal value for founder-led SMB deals. Note **eIDAS** legal validity is mandatory for the EU/francophone wedge (Better Proposals and GetAccept both call it out).

---

# Sources
- Proposify — Proposal software: https://www.proposify.com/proposal-software
- Proposify pricing (Capterra): https://www.capterra.com/p/133332/Proposify/
- Better Proposals — e-signatures: https://betterproposals.io/esignatures/
- Better Proposals (SoftwareAdvice): https://www.softwareadvice.com/electronic-signature/better-proposals-profile/
- GetAccept — product: https://www.getaccept.com/product
- GetAccept — CPQ: https://www.getaccept.com/product/cpq
- GetAccept — Salesforce integration: https://www.getaccept.com/integrations/salesforce
- GetAccept pricing (Proposify guide): https://www.proposify.com/blog/get-accept-pricing-guide
- DealHub — CPQ platform: https://dealhub.io/platform/cpq/
- DealHub pricing (CheckThat.ai): https://checkthat.ai/brands/dealhub/pricing
- Prospero (goprospero.com): https://goprospero.com/
- Prospero pricing (Capterra): https://www.capterra.com/p/184953/Prospero/
- Nusii — tour: https://nusii.com/tour/
- Nusii pricing/review (Instructional Solutions): https://www.instructionalsolutions.com/blog/nusii-review
- Bidsketch — tour: https://www.bidsketch.com/tour/
- Bidsketch pricing (Proposify guide): https://www.proposify.com/blog/bidsketch-pricing
- Concord — pricing: https://www.concord.app/pricing/
- Concord — contract workflow: https://www.concord.app/contract-workflow/
- Ironclad — CLM: https://ironcladapp.com/
- Ironclad CLM features/pricing (Juro): https://juro.com/learn/ironclad-clm
- DocuSign Gen for Salesforce: https://www.docusign.com/products/gen
- DocuSign Gen for Salesforce features/costs (eSign.ai): https://www.esign.ai/blog/docusign-gen-salesforce-features-subscription-costs
- DocuSign CLM pricing (Hyperstart): https://www.hyperstart.com/blog/docusign-clm-pricing/
