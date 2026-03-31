# Lightfield Teardown

## Overview

**Tagline**: "CRM that remembers everything and does the work for you."
**Positioning**: "AI-native CRM" — first CRM with "complete customer memory"
**Target**: Early-stage founders and scaling teams doing founder-led sales
**Access**: Self-serve signup with 14-day free trial (no demo gate for Startup plan)
**Pricing**: $99/user/month (Startup), $200/user/month (Pro, annual)
**App URL**: crm.lightfield.app
**Auth**: Stytch (magic link email + Google OAuth)
**Payments**: Stripe (with hCaptcha on checkout)
**Tech stack clues**: Next.js, Apollo DevTools present (GraphQL), Stytch auth, SendGrid for transactional email, Vector.co for visitor identification, GSAP for animations
**Social**: Twitter @lightfld, LinkedIn /company/lightfld
**Jobs**: Ashby (jobs.ashbyhq.com/Lightfield) — same ATS as Monaco
**Security**: SOC 2 Type II, HIPAA, ISO 27001 (coming soon). Vanta trust page.
**Support**: Direct Slack channel with Lightfield team per customer
**Founded**: Nov 2025 (based on "Why we built Lightfield" blog post)

---

## Key Differentiators

### 1. Schema-less Foundation
- No upfront configuration required
- Captures everything from day 1
- Evolve data model over time
- This is a philosophical choice: don't force founders to set up fields/stages/pipelines upfront

### 2. Complete Customer Memory
- Reads emails, meeting transcripts, conversation records
- Compiles exhaustive history of customer relationships
- NL-queryable with citations to original conversations
- "A world model for your business" — contextual understanding of company, product, market

### 3. Chat-First Interface
- "Ask Lightfield" input persistent at bottom of every page
- Chat threads saved in sidebar under "Chats"
- Can take actions directly from chat (create records, send emails, bulk updates)

---

## Onboarding Experience (7 steps, ~3 minutes)

1. **Create Profile**: First name, Last name, Role (Founder/Sales/Marketing/Partnerships/Product/CS/Ops/Other)
2. **Create Workspace**: Company name
3. **Pricing**: 14-day free trial activation, Stripe checkout, €0 due today
4. **Mail & Calendar Sync**: Google or Microsoft OAuth, configurable:
   - Account & contact creation mode (Selective/Auto)
   - Backsync range (1 month default, configurable)
   - Visibility settings (Full access/restricted)
   - Do-not-track emails/domains
5. **Meeting**: (skipped in our flow — likely meeting bot setup)
6. **About Work**: Company website (auto-filled from email domain), Country, Employee count (1-3 to 10k+), Referral source
7. **All Set**: Links to getting started docs, Slack channel invite

**Notable**: Website domain auto-extracted from email. Referral options include "AI Search" and "Saw your meeting bot" — reveals distribution channels. "Billboard / Bus Advertisement" suggests they're doing physical marketing.

---

## App Structure

### Navigation
- **Up next**: Daily view with Meetings + Tasks sections, "Just me" / "My team" toggle
- **Notifications**: Activity feed
- **Records**: Accounts, Opportunities, Contacts
- **Resources**: Tasks, Meetings, Notes
- **Lists**: Custom saved lists (new feature, Mar 2026)
- **Chats**: Persistent chat threads with Lightfield AI

### Chat Interface
- "Ask Lightfield" input at bottom of every page
- Capabilities listed:
  - **CRM Data**: Accounts, Opportunities, Contacts, Meetings, Tasks, Notes, Emails
  - **Analysis**: Summarize accounts, identify stalled deals, spot pipeline trends, web research
  - **Organization**: Lists, CSV import, data export
- **Current limitation**: Can't schedule or modify calendar meetings

### Accounts View
- Table view with Filter and Display controls
- Import/Export button
- Create account button
- Empty state: "Lightfield automatically creates accounts from your mail and calendar activity"

---

## Pricing Details

### Startup: $99/user/month (monthly)
- Up to 10,000 records
- 1,000 workflow events/month
- Call intelligence (record, transcribe, analyze)
- Automated data enrichment and record updates
- Unlimited agent queries and actions
- Fully configurable data model
- Email & calendar sync
- Agent workflow builder
- External system integration
- Dedicated Slack channel support

### Pro: $200/user/month (annual billing)
- Up to 50,000 records
- 10,000 workflow events/month
- All Startup features plus:
- Advanced user permissioning
- Dedicated CSM
- White glove onboarding and migration

---

## 7 Core Features (from homepage)

1. **Prep, capture, and summarize meetings** — Meeting prep with context, built-in call recorder, AI summaries
2. **Answer questions about your business** — NL queries with citations to original conversations
3. **Send personalized emails at scale** — Slice structured + unstructured data, send personalized outreach
4. **Give engineers stronger customer signal** — "Which customers asked for this feature, and why?"
5. **Build and edit your pipeline in bulk** — NL commands to reassign, update stages, tag segments
6. **Bring stale deals back to life** — Find quiet prospects with positive signals, draft revival emails
7. **Fill in missing data across your entire CRM** — Agent-powered enrichment

---

## Development Velocity (Changelog)

Weekly releases — extremely fast shipping:
- **Mar 13**: Lists, Background agent tasks, HIPAA, API beta
- **Mar 6**: Bulk delete, agent record operations, REST API
- **Feb 27**: Contact and account data model improvements, Granola MCP
- **Feb 20**: Code execution, artifact creation in chat
- **Feb 13**: Shareable meetings, code generation
- **Feb 6**: MCP connectors (Notion, Linear, Granola), member pages, workflow builder
- **Jan 30**: Dark mode, workflow triggers, task management
- **Jan 23**: Agentic workflows, record export
- **Jan 16**: "Up next" view, improved contact view, chat model preference
- **Jan 9**: HTTP out blocks, file uploads, internal chat sharing

---

## Testimonials

- **Marie Schneegans**, 14.ai Co-founder: Uses Lightfield for questions, feedback, coaching, drafts, presentations
- **Anna Yuan**, ScaleAgentic Co-founder: "system of record AND system of action"
- **Ola Kolade**, Underflow Co-founder/CEO: "things that would take an hour or two happen in minutes, sometimes seconds"
- **Alex Voronovich**, CashQ Founder/CEO: "full context before every meeting"
- **Neek Zanfack**, Reeva Co-founder: "query anything about any interaction"

All co-founders/CEOs of early-stage startups — same target as Monaco.

---

## Blog Insights

- **"LLMs also prefer stories to graphs and databases"** (Feb 2026) — reveals their technical philosophy: narrative-based customer memory vs structured data
- **"Why we built Lightfield"** (Nov 2025) — founding story
- **"The founder's guide to evaluating an AI CRM"** (Jan 2026) — positioning content

---

## What Lightfield Does NOT Do (Gap Analysis)

1. **No auto-built TAM** — no prospecting database, no ML scoring of target accounts
2. **No outbound sequences** — can draft emails but no multi-step automated sequences
3. **No autopilot enrollment** — doesn't decide who to email and when
4. **No signal overlay** — no job postings, funding events, tech stack tracking
5. **No inbound visitor identification** (despite using Vector.co on their marketing site, not in CRM)
6. **No phone dialer**
7. **No LinkedIn integration** for outbound
8. **No meeting scheduling** (acknowledged limitation)
9. **No pipeline signal-based stage changes** (like Monaco's auto-progression)
10. **No gift-sending** (Monaco's unique feature)

Lightfield is a MEMORY + QUERY system, not a PROSPECTING + OUTREACH system.

---

## Design Language

- **Theme**: Light mode by default (dark mode added Jan 2026)
- **Typography**: Clean sans-serif (Inter-like), warm brown/amber accents
- **Layout**: Sidebar nav + main content, chat pinned to bottom
- **Colors**: Warm palette — amber/brown highlights, not cold blue
- **Empty states**: Helpful, with clear CTAs ("Go to settings →")
- **Overall feel**: Notion-like minimalism meets CRM. Clean, not data-dense.
- **Brand**: Lightfield logo is an X-shaped mark. Warm, approachable.
- Contrast with Monaco: Monaco = Bloomberg terminal (dark, dense). Lightfield = Notion CRM (light, minimal).

---

## Technical Intelligence

- **Frontend**: Next.js (deployment on Vercel likely, dpl_ prefix in URLs)
- **API**: GraphQL (Apollo DevTools detected)
- **Auth**: Stytch (magic links + OAuth)
- **Payments**: Stripe
- **Email**: SendGrid for transactional
- **Analytics**: Vector.co (visitor identification on marketing site)
- **Bot protection**: PerimeterX/HUMAN (px-cloud.net detected)
- **Trust**: Vanta for SOC 2 compliance
- **ATS**: Ashby for job postings
- **Support**: Lightfield-hosted (support.lightfield.app)
- **Docs**: STL Docs (lightfield.stldocs.app)
- **MCP**: They offer MCP connectors (Notion, Linear, Granola) — forward-thinking

---

## Strategic Implications

### What we steal from Lightfield
1. **Schema-less data model** — no upfront config, evolve over time
2. **Complete customer memory** — every interaction stored and NL-queryable with citations
3. **Chat-first interface** — persistent chat as primary interaction
4. **Self-serve onboarding** — 3-minute signup to value
5. **Meeting prep + capture** — built-in recorder with AI summaries

### Where they're weak (our opportunity)
1. No TAM building or prospecting — they're purely reactive (wait for data to come in)
2. No outbound automation — can draft emails but no sequences
3. No scoring or prioritization — no ML-based account ranking
4. No signals — missing job postings, funding, tech stack, website visits
5. No autopilot — founder must decide who to email and when

### Our thesis
**Monaco does prospecting + outreach + coaching. Lightfield does memory + queries + capture. We do BOTH.**
