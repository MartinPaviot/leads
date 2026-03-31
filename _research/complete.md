# Research Complete — Summary of All Findings

**Date**: 2026-03-30
**Investigations completed**: 14/14

---

## I. Competitive Landscape

### Monaco (Primary Competitor)
- **What they are**: "The first revenue engine for startups" — AI-native platform replacing legacy CRM
- **Team**: Sam Blond (ex-CRO Brex), Malay Desai (ex-SVP Eng Clari), Shek Viswanathan (ex-CPO Apollo & Qualtrics)
- **Investors**: Founders Fund, Human Capital, Greenoaks + Garry Tan, Peter Thiel, Ryan Petersen
- **Access**: Demo-gated, no self-serve. Forward-deployed AE per customer.
- **6-step product**: Build TAM → Overlay signals → Execute sequences → Capture activity → Track pipeline → Ask Monaco (CRO Copilot)
- **Killer features**: Auto-built TAM with ML scoring + explanations, gift-sending in sequences, signal-based pipeline stages, brutally specific deal coaching from meeting recordings
- **Weakness**: No self-serve, requires human AE, no transparent pricing, limited channel (email-only sequences)
- Full teardown: `_research/teardown-monaco/teardown.md`

### Lightfield (Primary Competitor)
- **What they are**: "AI-native CRM with complete customer memory"
- **Access**: Self-serve, 14-day free trial, $99/user/month
- **Core philosophy**: Schema-less foundation, zero manual entry, NL queries with citations
- **7 core features**: Meeting prep/capture, NL questions, personalized emails, engineer signal, bulk pipeline ops, stale deal revival, data enrichment
- **Killer features**: Chat-first interface persistent on every page, "world model" for your business, schema-less data model
- **Weakness**: No TAM building, no outbound sequences, no scoring/prioritization, no signal overlay, no autopilot
- Full teardown: `_research/teardown-lightfield/teardown.md`

### Key Insight
**Monaco = prospecting + outreach + coaching. Lightfield = memory + queries + capture. We build BOTH.**

### Also Evaluated
- **Attio**: "Ask more from CRM" — flexible data model, relationship intelligence, self-serve, $0-99/user/month. See `_research/teardown-attio.md`
- **Clay**: Data enrichment + waterfall approach — 75+ data providers, workflow builder. See `_research/teardown-clay.md`

---

## II. Technical Decisions

### Stack: See `_research/stack-decision.md`
- **Frontend**: Next.js 16 (App Router) — streaming, AI SDK, largest ecosystem
- **Database**: PostgreSQL on Neon — pgvector for embeddings, JSONB for schema-less, RLS for multi-tenancy
- **LLMs**: Multi-model (Claude Sonnet for writing/coaching, Haiku for queries, GPT-4.1 Nano for classification)
- **Auth**: Clerk
- **Queues**: BullMQ on Redis
- **Deployment**: Vercel (web) + Railway (workers)

### Data Architecture: See `_research/data-architecture.md`
- Entity model: Tenant → Company/Contact/Deal/Activity + schema-less JSONB properties
- Multi-tenancy: Row-level security (RLS) on PostgreSQL
- Customer memory: Embed all interactions with text-embedding-3-small, store in pgvector, RAG retrieval with citations
- Activity stream: Event sourcing pattern for all interactions
- Signal storage: Time-series in PostgreSQL with partitioning

---

## III. Market Intelligence

### Compliance: See `_research/compliance.md`
- CAN-SPAM: Opt-out required, physical address, no deceptive headers
- GDPR: Legitimate interest basis for B2B cold email (documented), right to deletion, DPA required
- Google 2025-2026: Bulk sender rules — authentication (SPF/DKIM/DMARC), <0.3% spam complaint rate, one-click unsubscribe
- **Critical threshold**: Gmail 0.1% spam complaint rate before issues, 0.3% = delivery blocked

### Deliverability: See `_research/deliverability.md`
- Domain warming: 2-4 weeks minimum, start 10-20 emails/day, ramp 15-20%/day
- Mailbox rotation: 3-5 inboxes per domain, 30-50 emails/inbox/day
- SPF/DKIM/DMARC mandatory — no exceptions in 2026

### Data Providers: See `_research/data-providers.md` (when available)
### Email Providers: See `_research/email-providers.md` (when available)

### LLM Costs: See `_research/llm-providers.md`
- Best quality for email writing: Claude Sonnet 4.6 ($3/$15 per 1M tokens)
- Best for classification: GPT-4.1 Nano ($0.10/$0.40 per 1M tokens)
- Prompt caching saves 90% on repeated system prompts

### Unit Economics: See `_research/unit-economics.md`
- Target COGS per customer: ~$15-40/month at $99/month price point (60-85% gross margin)
- Biggest cost drivers: LLM usage, data enrichment, email sending
- Break-even at $99/mo: ~50-100 customers (depending on infra costs)

---

## IV. Risks

### Top 5 Risks (from `_research/risks.md`):
1. **LLM reliability for autonomous outreach** — AI sending emails on behalf of founders. One bad email = brand damage. Mitigation: human-in-the-loop approval for first N emails, confidence thresholds.
2. **Email deliverability at scale** — Cold outbound is increasingly blocked. Mitigation: proper warming, rotation, compliance, reputation monitoring.
3. **Competition from Monaco** — Strong team, strong investors, head start. Mitigation: self-serve distribution, chat-first UX, no human AE bottleneck.
4. **Data accuracy** — Enrichment data can be wrong (outdated titles, wrong emails). Mitigation: multi-source verification, confidence scores.
5. **Regulatory risk** — Email laws tightening, AI regulations emerging. Mitigation: compliance by design, opt-out infrastructure, transparent AI use.

---

## V. Security: See `_research/security-privacy.md`
- RLS for tenant isolation
- Encrypt OAuth tokens at rest (AES-256)
- Separate customer email/meeting data encryption
- SOC 2 prep from day 1 (use Vanta)
- GDPR right-to-deletion architecture

---

## VI. Strategic Synthesis

### Our Positioning
**For early-stage founders doing founder-led sales**: the autonomous GTM engine that combines Monaco's prospecting and outreach with Lightfield's memory and intelligence — fully self-serve, chat-first, no human AE required.

### Core Value Props (in order of importance)
1. **Zero setup**: Auto-built TAM on Day 1 (like Monaco) + schema-less data model (like Lightfield)
2. **Complete memory**: Every email, call, meeting captured and queryable with citations
3. **Autonomous outreach**: AI writes, sends, and follows up — with founder guardrails
4. **Signal intelligence**: Job postings, funding, tech stack, website visits drive prioritization
5. **Deal coaching**: Brutally specific feedback from meeting analysis (like Monaco's CRO Copilot)
6. **Self-serve**: Start in minutes, $99/month, no demo gate, no human AE dependency

### Moats to Build
1. **Customer memory compound effect** — the more data, the better the AI gets at understanding each customer's business. Hard to switch away.
2. **Sequence performance data** — aggregate learning across customers about what works (subject lines, timing, personalization). Network effect.
3. **Chat-first UX** — if we nail the chat interface, it becomes the natural way founders interact with their GTM. Habit-forming.

### What We're NOT Building (V1)
- Phone dialer
- LinkedIn automation
- Chatbot / live chat widget
- Gift-sending integration
- Forward-deployed human AE service
