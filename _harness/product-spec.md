# Product Spec — LeadSens

## Vision

The autonomous GTM engine for early-stage founders doing founder-led sales. Combines Monaco's prospecting + outreach + coaching with Lightfield's memory + queries + capture. Chat-first. Self-serve. No human AE.

## Target User

Early-stage founder (seed to Series A), 1-10 person team, technical or semi-technical, selling B2B SaaS/dev-tools/AI products. Currently using some combination of HubSpot/Apollo/Outreach/spreadsheets and hating it.

**Jobs to be done**:
1. Know who to sell to (TAM + scoring)
2. Reach them effectively (sequences + personalization)
3. Remember everything (auto-capture + memory)
4. Know what's happening (pipeline + signals)
5. Get better at selling (coaching + insights)

## Core Architecture

### Chat-First Interface
The primary interaction is "Ask LeadSens." Every action can be taken from chat. The traditional UI (tables, kanban, forms) exists but is secondary to the chat experience.

### Three Engines
1. **Memory Engine**: Captures, stores, and retrieves every customer interaction with NL queries and citations
2. **Prospecting Engine**: Builds TAM, scores accounts, overlays signals, executes sequences
3. **Intelligence Engine**: Coaches on deals, surfaces risks, suggests actions, answers questions

---

## Feature Areas

### F1: Foundation
- F1.1: Auth (Clerk, Google/Microsoft OAuth)
- F1.2: Multi-tenant workspace (Neon PostgreSQL, RLS)
- F1.3: Core data model (Company, Contact, Deal, Activity — schema-less JSONB properties)
- F1.4: Chat interface (streaming, persistent, threaded)
- F1.5: Settings and onboarding flow

### F2: Memory Engine
- F2.1: Email sync (Google/Microsoft — OAuth, IMAP)
- F2.2: Calendar sync (meetings auto-captured)
- F2.3: Meeting recorder (built-in or integration)
- F2.4: Activity timeline (all interactions per contact/company/deal)
- F2.5: Auto-summarization (meetings, email threads)
- F2.6: Embedding + RAG pipeline (pgvector, text-embedding-3-small)
- F2.7: NL queries with citations ("When did I last talk to X?", "What did Y say about pricing?")
- F2.8: CSV import / CRM migration

### F3: Prospecting Engine
- F3.1: Company enrichment (firmographics, industry, size, tech stack)
- F3.2: Contact enrichment (title, email, LinkedIn, phone)
- F3.3: TAM builder (auto-build from ICP description)
- F3.4: ML scoring (account score with explanations)
- F3.5: Signal overlay (job postings, funding, tech changes, website visits)
- F3.6: AI semantic search ("crypto companies hiring RAG engineers")

### F4: Outreach Engine
- F4.1: Sequence builder (multi-step, timed)
- F4.2: AI email writer (personalized from enrichment + signals + memory)
- F4.3: Autopilot enrollment (AI decides who, when, what)
- F4.4: Email sending infrastructure (SES, mailbox rotation, warm-up tracking)
- F4.5: Reply detection + auto-stop
- F4.6: Deliverability monitoring (bounce rates, spam complaints)

### F5: Pipeline
- F5.1: Deal management (kanban + list views)
- F5.2: Signal-based stage progression
- F5.3: Risk detection (ghosting, stalls, competitor mentions)
- F5.4: Auto-generated deal summaries
- F5.5: Pipeline analytics (value, velocity, win rate)

### F6: Intelligence
- F6.1: CRO Copilot chat (deal coaching, strategy)
- F6.2: Meeting analysis (what went well, what didn't, specific feedback)
- F6.3: Prioritized action suggestions ("Do X to close more revenue")
- F6.4: Proactive insights (trends, patterns, alerts)

### F7: Infrastructure
- F7.1: Background job system (BullMQ)
- F7.2: Webhook infrastructure
- F7.3: API (REST, for integrations)
- F7.4: Workflow builder (triggers → actions)

---

## Design Principles

1. **Chat-first**: Every action possible from chat. Traditional UI is a shortcut, not the primary path.
2. **Zero config**: Works on Day 1 with no setup. Schema-less. Auto-detection.
3. **Autonomous with guardrails**: AI acts, founder approves. Not "AI suggests, founder executes."
4. **Show your work**: Every AI action has reasoning and citations. Build trust.
5. **Dense when needed, minimal when not**: Pipeline view = dense (like Monaco). Chat = clean (like Lightfield).
6. **Dark mode default**: Follows Monaco's aesthetic for data-dense views. Warm accents.

---

## Non-functional Requirements

- **Performance**: Chat response start <2s, page load <1s, search <500ms
- **Security**: SOC 2 prep from day 1, RLS, encrypted OAuth tokens, no PII in logs
- **Compliance**: CAN-SPAM, GDPR, Google/Microsoft bulk sender rules built-in
- **Scale**: Support 1000 users without architecture changes
- **Observability**: Structured logging, error tracking (Sentry), key metrics

---

## Milestone Checkpoints (Martin's review)

1. **M1: Foundation** — Auth, data model, chat interface, settings → "Can I log in and chat?"
2. **M2: Memory** — Email/calendar sync, activity timeline, NL queries → "Does it remember my conversations?"
3. **M3: Prospecting** — Enrichment, TAM builder, scoring, signals → "Does it know who I should sell to?"
4. **M4: Outreach** — Sequences, email writer, sending → "Can it email prospects for me?"
5. **M5: Pipeline** — Deal management, risk detection, analytics → "Can I track my deals?"
6. **M6: Intelligence** — Coaching, meeting analysis, proactive insights → "Does it make me a better seller?"
