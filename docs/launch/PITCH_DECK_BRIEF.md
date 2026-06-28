# PITCH DECK BRIEF

> Generated 2026-06-10 by automated analysis of this repository only.
> Rules followed: facts are sourced from repo files (paths given); nothing is invented;
> every inference is marked [INFERRED]; customer/tenant names are anonymized;
> no secrets, keys, or algorithm internals are included.
> Where documents from different dates conflict, the later (June 2026) state is reported
> and the conflict is flagged for the founder to resolve.

---

## 1. Product identity

- **Product name: Elevay** (user-facing brand everywhere; live at `elevay.dev`).
  Legacy internal name **LeadSens** survives only in package scopes (`@leadsens/web`) and
  early specs (`_harness/product-spec.md` is titled "Product Spec - LeadSens"). The repo
  folder is `leads`.
- **One-line value proposition** (verbatim, two sources):
  - Landing hero (`app/apps/web/src/app/(marketing)/page.tsx`):
    > "Elevay runs your pipeline. You run the conversations."
    > "The autonomous GTM engine for founder-led sales. Chat-first CRM with AI-powered
    > outbound, auto-enrichment, and deal coaching."
  - README.md:
    > "Autonomous GTM engine for founder-led sales. Chat-first CRM that captures every
    > customer interaction, scores leads with ML, and runs outbound sequences -- zero
    > manual data entry."
- Supporting positioning line from the landing page: "It's the back office a founder
  doesn't have yet: prospecting, list-building, drafting, and note-taking, so one person
  can run a full pipeline."

---

## 2. Problem solved

**Pain point** (documented in `_research/user-pain.md` and `_research/elevay-1m-arr-plan.md`;
these are internally compiled market research, sources cited in-file but not third-party
validated):

- Founder-led sales requires a fragmented tool stack: Clay + Apollo + Instantly + HubSpot +
  Lavender + LinkedIn Sales Navigator, totalling roughly $383-543/month across 6+ tools,
  none of which talk to each other.
- Founders spend 60-80% of their time on non-selling activity (data entry, tool plumbing,
  list building, note taking).
- CRM adoption fails 20-70% of the time; ~79% of opportunity data never enters the CRM
  (figures as cited in `_research/user-pain.md`).
- The deeper claim: the founder's real gap is not tools but *process* - "Not more tools.
  The process. The VP Sales you can't afford" (`_research/elevay-1m-arr-plan.md`).
  Key quote (French, verbatim): "Elevay, c'est le VP Sales que tu ne peux pas encore
  embaucher - il monitore tes signaux, prepare tes emails, te dit quelles questions poser
  en discovery, et te previent quand un deal va mourir."

**Target persona** (verbatim from `_harness/product-spec.md`):

> "Early-stage founder (seed to Series A), 1-10 person team, technical or semi-technical,
> selling B2B SaaS/dev-tools/AI products. Currently using some combination of
> HubSpot/Apollo/Outreach/spreadsheets and hating it."

Jobs to be done (product-spec): (1) know who to sell to, (2) reach them effectively,
(3) remember everything, (4) know what's happening, (5) get better at selling.

**Geography - unresolved conflict between strategy docs:**
- Earlier strategy and all live operation: francophone wedge (Switzerland-Romandie/France);
  the live design-partner workspace targets Suisse romande; FR/CH data registries are built
  into the product.
- `_research/elevay-geo-and-cold-email-strategy.md` reverses this: Tier 1 = US, Tier 2 =
  UK/AU, France deferred 12+ months (reasons given: card friction, slow cycles, August).
- The founder must pick one narrative for the deck (see Section 9).

---

## 3. Solution and features

A multi-tenant, chat-first GTM workspace. Maturity judged from code state, production
audits in `_audit/` (June 2026), and milestone tracking in `_harness/`.

### Capability groups

**A. Market building and enrichment - shipped**
- ICP definition; TAM auto-built from ICP via Apollo company search.
- Enrichment waterfall across providers: Apollo (firmographics, contacts), plus
  French/Swiss official registries (SIRENE/Pappers for France, Zefix/LINDAS for
  Switzerland), FullEnrich and Lusha for emails/mobiles. GDPR-aware provider selection
  documented in `_research/benchmark-contact-enrichment.md`.
- CSV import with field mapping; TAM lifecycle (approval queue, freshness, exclusions).
- In progress: full multi-source TAM discovery bridge (registry-to-domain resolution);
  FullEnrich live in code but awaiting production credits.

**B. Zero-entry capture and memory - shipped, one gap**
- Email sync: Google OAuth, Microsoft Entra OAuth, and generic IMAP/SMTP mailboxes;
  calendar sync via OAuth and CalDAV. Captured interactions become shared CRM activities.
- Auto-summarization of threads and meetings; activity timeline per contact/company/deal.
- Bi-temporal context graph (entity extraction, resolution, edge invalidation with
  history) + pgvector RAG + hybrid retrieval (BM25 + embeddings + reciprocal rank fusion).
- Natural-language queries over the pipeline with citations to source conversations.
- Human-in-the-loop capture approval mode (AI-extracted facts parked for review).
- In progress / blocked: native meeting recording via Recall.ai (vendor account
  verification pending - milestone M12, the only open milestone of 13).

**C. Prioritization and intelligence - shipped (single-tenant validation only)**
- Daily ranked "needs you" home briefing + inbox triage lanes (attention/handled/snoozed).
- Scoring and analysis engines (paths in README): buyer-intent scoring, trained
  Naive Bayes predictive scorer (no-LLM, trained on deal outcomes), stall predictor,
  win/loss analysis, stakeholder/org mapping, Monte Carlo revenue forecasting
  (p10/p50/p90), auto-generated research dossiers.
- Signal overlay (job postings, funding, tech changes, website visitors) feeding scores.
- [INFERRED] These engines are code-complete and tested, but validated against only one
  real workspace so far; predictive quality at scale is unproven.

**D. Outbound execution - shipped (email + voice); LinkedIn is stub (spec only)**
- Email: multi-step sequences with approval gates, AI-personalized drafting from
  enrichment + signals + memory, per-owner sending identity (each user sends only as
  themselves), reply detection and auto-stop, deliverability monitoring, warmup tracking,
  domain health. Production sending was enabled 2026-06-10 (a test-mode guardrail had
  kept all prior sends sandboxed; zero live sequences were running at flip time).
  Evidence of deliverability setup: 10/10 mail-tester score screenshot
  (`mail-tester-elevay-10of10.png`).
- Voice: in-browser Call Mode - two-way calling through Twilio (browser agent leg +
  prospect leg), live transcription (Deepgram), per-prospect grounded call script and
  situational brief, post-call AI qualification writing MEDDPICC-style facts back to the
  CRM with provenance, buy-a-number-inline, campaign/cadence engine. Verified live in
  production 2026-06-09 (two-leg call + transcript chunks, `_audit/2026-06-09-callmode-voice-bridge.md`).
- LinkedIn multi-channel: spec'd (Unipile-based, EU vendor, 4 sprints planned in
  `_specs/linkedin-multichannel`-era docs) - not built.

**E. Pipeline and deal execution - shipped**
- Kanban + list deal management; signal-based auto-progression with configurable rules;
  stall/at-risk flags; auto deal summaries; pipeline analytics.
- Proposal auto-draft: fills the user's own DOCX template from the live info base (v1).
- Deal coaching and prioritized action suggestions; meeting prep and booking from the
  call surface.

**F. Chat-first command layer - shipped**
- The chat is the primary interface: ~126 tools across 25 modules (query, create, update,
  action, memory, intelligence, coaching, import, undo, navigation, forecasting...).
- Chat *drives the UI* (navigates, opens records, pre-fills composers), routed per-turn by
  an intent-based tool router and a capability resolver (role + surface + flags).
- Four guardrail layers documented in README: capability resolver, approval mode,
  sending-identity enforcement, progressive trust score.

**G. Workspace, security, compliance - shipped (June 2026 hardening wave)**
- Roles (admin/member/viewer), invites, offboarding with session revocation, MFA (TOTP +
  recovery codes), login audit trail, HMAC-signed audit rows, secrets encrypted at rest.
- Postgres row-level security: real DB-level policies deployed 2026-06-10 (migration
  `0074_rls_enforced.sql`, app role subject to policies on all tenant-scoped tables);
  before that isolation was application-layer only.
- SOC 2 readiness program: 12 written policies + subprocessor register in `_compliance/`,
  CI security gate (typecheck + tests + gitleaks), 5-minute uptime probe, restore drill
  passed. Pending: DPA signatures, pentest, compliance platform, GitHub branch protection.
- EU data posture: Anthropic EU endpoint supported and allowlisted, PostHog EU instance,
  EU database region preferred (`_compliance/subprocessors.md`).

**H. Internal ops (not user-facing) - shipped**
- Admin console (agent traces, evals, channel monitoring), LLM observability tables,
  agent eval framework with golden cases, self-improving prompt optimizer with canary
  deployment and golden-case gating.

### End-to-end workflow the product enables

Connect mailbox + calendar and describe your ICP (chat or light modal) ->
Elevay builds and enriches the TAM from data providers and official registries ->
scores and overlays signals -> presents a daily ranked briefing of what needs the founder
-> founder approves AI-drafted sequences / makes calls in Call Mode with a grounded script
-> every email, meeting and call is captured automatically into a shared memory ->
post-interaction intelligence updates contacts/deals (with human approval) ->
chat answers any pipeline question with citations and executes commands ->
proposals are drafted from the founder's own template -> the human does the meetings
and relationships ("AE stays human" principle).

---

## 4. Differentiation signals

**Explicit positioning found in docs** (`_research/monaco-vs-elevay-mapping.md`,
`_reports/monaco-vs-elevay-honest.md`, teardowns of Lightfield/Attio/Clay/Rox):

- Core thesis: union of two funded US competitors' value props in one product, for a
  segment both ignore. "Everything Monaco does (TAM, ML scoring, signals, AI outbound,
  coaching) + everything Lightfield does (zero data entry, auto-capture, NL queries with
  citations)" - but founder-shaped instead of sales-team-shaped (CLAUDE.md mission;
  teardown docs).
- Per-competitor claims (internal analysis; funding figures are as stated in internal
  research, not independently verified here):
  - Monaco (~$35M raised): enterprise-team-shaped; Elevay claims the founders-only
    segment Monaco's economics can't serve.
  - Lightfield (~$81M referenced in escalation notes): CRM/memory-first; Elevay adds the
    outbound/process engine.
  - Apollo: data without process; Elevay claims "when to act and what to say".
  - Clay: post-prospecting enrichment tool; Elevay claims full cycle TAM-to-close.
  - Attio: horizontal AI CRM; Elevay is vertical on founder-led outbound.
  - Rox (~$50M, enterprise): Elevay is the founder-segment counterpoint.
  - Honest gaps are documented too: competitors' data moats, capital and brand are
    acknowledged as stronger (`_reports/monaco-vs-elevay-honest.md`).
- Philosophy embedded in product principles (`_research/elevay-product-principles.md`):
  signal-driven timing rather than scheduled cadences ("kairos, not chronos"); machine
  reveals / human decides (approval-gated autonomy, no autonomous sending without review);
  "show your work" citations everywhere; outreach must give before it asks; the AE role
  stays human.

**Technical choices that read as moat / unique approach:**

- Bi-temporal knowledge graph + hybrid retrieval as the memory substrate (vs. plain RAG).
- Per-turn capability resolver + 4-layer guardrails + progressive trust score: an
  architecture for *safe* autonomy, which is the adoption blocker for AI outbound.
- Self-improving prompt system with canary deploys gated on golden-case evals.
- A trained, non-LLM predictive scorer alongside LLM features (cheap, explainable).
- Sovereign-data wedge: French (SIRENE/Pappers) and Swiss (Zefix/LINDAS) official
  registries wired in as first-class TAM sources, GDPR-clean enrichment cascade, EU LLM
  endpoint and EU analytics. US competitors do not have this FR/CH registry depth.
  [INFERRED from presence in code + research docs; competitive absence not re-verified.]
- Integrated voice cold-calling (browser bridge + live transcript + grounded script +
  auto-qualification) inside the same memory loop - none of the teardown competitors
  combine this with zero-entry capture per the internal teardowns.
- Sales methodology encoded as product (cold-call playbook, outbound frameworks,
  scripts library in `_research/` and `docs/outbound-scripts-library.md`).

---

## 5. Business model evidence

**Implemented in code (Stripe) - real but minimal tiers:**
- Full Stripe integration: checkout, customer portal, subscription state, usage events,
  webhook handler, plan-limit enforcement middleware on chat/contacts/mailboxes/sending
  (`app/apps/web/src/app/api/billing/*`, `src/db/billing-schema.ts`,
  `src/lib/billing/plan-limits.ts`).
- Plans defined in code: Trial $0 (14 days, capped), Starter $49/mo, Pro $99/mo
  (limits on contacts, emails, AI queries, mailboxes).
- No evidence anywhere in the repo of a single real payment processed.

**Documented pricing strategy (research docs) - different numbers:**
- `_research/elevay-mastery-04-pricing-science.md` + `elevay-1m-arr-plan.md`: anchor
  tier $999/mo ("Growth", the wedge), founder tier $499/mo for first 10 customers
  (lifetime), Scale $1,999/mo; annual $9,990. Anchored against the cost of an SDR
  ($60-80K/yr), under the $10K procurement threshold. ~84 customers at ~$12K ACV = $1M ARR.
- Unit economics (`_research/unit-economics.md`): COGS ~$52/customer/month at standard
  usage (email verification, enrichment, LLM, transcription), gross margin 70-83%,
  optimization path to ~$32 COGS.

**Discrepancy to resolve:** the code charges $49/$99; the strategy says $499/$999/$1,999.
The deck needs one answer (see Section 9).

---

## 6. Traction evidence

Stated conservatively; nothing here is revenue.

- **No paying customers. No external users documented. No waitlist found. Pre-revenue.**
- **One live production workspace** (design-partner tenant: a Swiss B2B organization,
  anonymized, affiliated with the founder): 767 real enriched accounts (Apollo-sourced,
  June 2026 audits in `_audit/`); contacts/deals volumes were minimal at audit time.
  This is dogfooding/design-partner usage, not arms-length traction.
- **Production is real**: live domain (elevay.dev) with auto-deploy, two-way phone calls
  verified live in production (2026-06-09), real email sending enabled (2026-06-10),
  10/10 mail-tester deliverability score (screenshot in repo root).
- **Analytics wired, no usage data in repo**: PostHog (EU host, env-gated) + Sentry
  configured; no exported metrics/dashboards committed.
- **Demo assets exist**: `../demo/DEMO_SCRIPT.md` (3-5 min, 5 flows) + `../../demo-qa/` screenshots.
- **Capital efficiency datum**: total documented external build spend ~$2
  (`_reports/spending.md`); everything runs on free tiers so far.
- The GTM plan itself (`_research/elevay-strategy-v2.md`) concedes this: phase 1 is a
  free "prove it on your real data" service for 5 founders to generate case studies
  ("Vanta appliquee a Elevay. Service d'abord, produit ensuite."), realistic $200-330K
  ARR at month 6, $1M ARR months 9-12 - internal projections, not commitments.

---

## 7. Stack and build maturity

**Stack (one paragraph):** TypeScript Turborepo: Next.js 15 / React 19 / Tailwind 4 web
app + small admin and worker apps; PostgreSQL with pgvector and Drizzle ORM (79 SQL
migrations, ~109 tables); Auth.js v5 (Google, Microsoft Entra, credentials, MFA);
Inngest background jobs (~79 job files) + 5 Vercel crons; Vercel AI SDK with Anthropic
Claude primary and OpenAI fallback/embeddings (circuit-breaker failover, EU endpoint
support); Twilio + Deepgram voice; Resend + direct IMAP/SMTP/OAuth email; CalDAV
calendars; Stripe billing; PostHog (EU) + Sentry; deployed on Vercel with auto-deploy
from `main` to elevay.dev. (README's stack table is partially stale: counts understated,
EmailEngine is vestigial, replaced by direct IMAP/SMTP.)

**Honest maturity assessment: functional MVP, deployed to production, pre-revenue.**
Stronger than a prototype: real auth/tenancy/RLS, billing, CI, security hardening, live
voice and email paths, 13 of 13 original milestones complete except meeting recording
(M12). Weaker than production-ready SaaS: one real workspace, several paths wired only
days ago (RLS strict mode, live sending), meeting recording blocked on a vendor account,
June audits caught config-level outages (since fixed) - it has not yet survived multiple
arms-length customers. Closed design-partner beta is the realistic current stage
[INFERRED from `_audit/` + `_reports/launch-readiness.md`].

- **Tests**: 334 unit/integration test files (Vitest) + 13 Playwright e2e specs +
  an agent eval suite (golden cases); one line.
- **CI**: GitHub Actions - typecheck + tests + gitleaks secret scan on push/PR, plus a
  5-minute uptime probe workflow; one line.
- **Deployment**: Vercel git-connected, push-to-main auto-deploys production at
  elevay.dev; 5 cron jobs; one line.
- **Velocity datum**: 1,134 commits since 2026-03-31 (~10 weeks), 130+ PRs, 23 unmerged
  feature branches. Development is run as an autonomous AI-agent harness with a
  spec -> build -> hostile-QA evaluation loop documented in `_harness/` (itself a
  process/story asset for the deck).

---

## 8. Roadmap signals (found in repo)

- **M12 (only open milestone)**: native meeting recording + 3-channel notifications
  (`_harness/milestones.json`; blocked on Recall.ai account verification).
- **LinkedIn multi-channel outbound**: fully spec'd (Unipile, EU vendor, queue + approval,
  4 sprints) - not built.
- **TAM multi-source completion**: registry-to-domain resolution bridge for
  SIRENE/Pappers/Zefix sources (partially shipped).
- **Living per-prospect call-script engine**: built on a branch, behind main; plus an
  editable in-product cold-call playbook (9 scoring levers) planned from
  `_research/cold-call-prep-playbook-2026-06.md`.
- **SOC 2 externals**: DPAs, penetration test, compliance platform (Vanta/Drata),
  GitHub branch protection (needs paid plan).
- **GTM next steps per strategy docs**: operate the framework manually for 5 founders
  (free, 30 days) -> convert to paid -> case studies -> content -> outbound; geo
  expansion decision (US vs francophone).
- Backlog artifacts: `_specs/NEXT_SESSION.md`, `docs/improvement-plan-12h.md`,
  `PRE-LAUNCH-CHECKLIST.md` (13 items flagged as external setup: Stripe prod, PostHog,
  Azure verification, Slack, Recall...), larger ambitions in `_specs/SALES-AGENT-SYSTEM`,
  `_specs/CAMPAIGN-ENGINE-1000X`, `_research/elevay-x1000-technical-ambition.md`.
- ~12 TODO markers in app source (low).

---

## 9. Open questions (not answerable from the repo - founder must fill)

**Identity, team, legal**
1. Team: founders, headcount, backgrounds, founder-market fit story. (Repo shows a
   single git author plus AI agents; no team page or bios anywhere.)
2. Legal entity, incorporation country, cap table, IP assignment.
3. Funding history, current runway, the ask (amount, instrument), use of funds.

**Market and positioning decisions**
4. Which geography leads the deck: francophone wedge (matches the live design partner,
   the FR/CH registry moat, GDPR posture) or US-first (matches
   `elevay-geo-and-cold-email-strategy.md`)? The repo contains both positions.
5. Which pricing is current: implemented $49/$99 tiers or strategy-doc $499/$999/$1,999?
6. Validated market size: the ~3,500-founder wedge TAM and all market stats are internal
   estimates; third-party TAM/SAM/SOM sourcing needed.
7. Up-to-date competitive facts (Monaco/Lightfield/Rox funding, pricing, feature state) -
   internal teardowns date from April-June 2026.

**Traction and proof**
8. Any design-partner results expressible as a case study (pipeline generated, meetings
   booked, reply rates, time saved)? The repo proves the machine works, not outcomes.
9. Beta cohort: named prospects/LOIs/waitlist? None exist in the repo.
10. Actual usage metrics once PostHog has traffic (activation, retention, NL-query usage).

**Operations and economics**
11. Real COGS at live usage vs. the modeled $52/customer (model predates live sending).
12. Compliance commitments to customers: data residency promise (EU?), DPA template,
    SOC 2 audit timeline, pentest date.
13. Brand/trademark status of "Elevay"; domain strategy (.dev vs .com).
14. Accelerator specifics: program goals, demo-day narrative, milestones for the batch.

---

*End of brief. Sources: README.md, CLAUDE.md, `_harness/` (product spec, milestones,
feature list, sprint reports), `_research/` (strategy, pricing, unit economics, user
pain, competitor teardowns, compliance), `_reports/` (launch readiness, spending,
honest competitive audit), `_audit/` (June 2026 live production audits), `_compliance/`,
application code under `app/apps/web/` (schema, API routes, billing, auth, landing copy),
and git history. Generated 2026-06-10.*
