# AUDIT-CONTEXT.md — Elevay Preflight Discovery

> Auto-generated 2026-04-27. Source of truth for 03-AUDIT-MAIN.md.
> Repo: C:\Users\marti\leads (branch: audit/dd-a16z from main)

---

## Section 1 — Stack effective

| Couche | Detectee | Version | Evidence |
|--------|----------|---------|----------|
| Frontend framework | Next.js | 15.5.15 (web), 15.3.0 (admin) | apps/web/package.json, apps/admin/package.json |
| Language | TypeScript | 5.8.0 | root package.json |
| ORM | Drizzle ORM | 0.45.2 | root pnpm override |
| DB | PostgreSQL (Neon serverless) | @neondatabase/serverless 1.0.2 | apps/web/package.json |
| Async/queue | Inngest | 4.1.0 | apps/web/package.json |
| Queue backend | BullMQ + Redis (ioredis) | bullmq 5.34.0, ioredis 5.6.1 | apps/worker/package.json |
| LLM Provider 1 | Anthropic (via Vercel AI SDK) | @ai-sdk/anthropic 3.0.64 | apps/web/package.json |
| LLM Provider 2 | OpenAI (via Vercel AI SDK) | @ai-sdk/openai 3.0.49, openai 6.33.0 | apps/web/package.json |
| AI SDK Core | Vercel AI SDK | ai 6.0.141, @ai-sdk/react 3.0.143 | apps/web/package.json |
| OAuth/Auth | NextAuth v5 (Auth.js) | next-auth 5.0.0-beta.30 | apps/web/package.json |
| Vector DB | PostgreSQL pgvector | ensure-vector-index.ts | apps/web/src/db/ensure-vector-index.ts |
| Observability | Sentry | @sentry/nextjs 10.48.0 | apps/web/package.json |
| Analytics | PostHog | NEXT_PUBLIC_POSTHOG_KEY in env | .env.example |
| Sandboxing | ABSENT | — | — |
| Test framework | Vitest + Playwright | vitest 4.1.2, @playwright/test 1.59.1 | apps/web/package.json |
| Package manager | pnpm | 10.15.1 | root package.json:packageManager |
| Email sending | Resend | 6.10.0 | apps/web/package.json |
| Payment | Stripe | 21.0.1 | apps/web/package.json |
| CSS | Tailwind CSS v4 | 4.0.0 | apps/web/package.json |
| Google APIs | googleapis | 171.4.0 | apps/web/package.json |
| Meeting bot | Recall.ai | via RECALL_API_KEY | .env.example |
| Deployment | Vercel | vercel.json | apps/web/vercel.json |

Non-trivial dependencies: @ai-sdk/anthropic, @ai-sdk/openai, ai (Vercel AI SDK core), inngest, bullmq, ioredis, googleapis, stripe, resend, @neondatabase/serverless, drizzle-orm, @auth/drizzle-adapter, @tanstack/react-virtual, framer-motion, papaparse, bcryptjs.

Monorepo structure: Turborepo with pnpm workspaces.

---

## Section 2 — Topologie du repo

```
leadsens/ (root)
├── apps/
│   ├── web/         — Next.js 15 main app (dashboard, marketing, API routes, chat)
│   ├── admin/       — Next.js 15 admin dashboard (agent ops, evals, business intelligence)
│   └── worker/      — BullMQ workers (email send, reply, warmup, health)
├── packages/
│   ├── database/    — Shared DB package (currently empty/node_modules only)
│   └── shared/      — Shared utilities
├── .claude-audit/   — This audit kit
├── turbo.json       — Turborepo pipeline config
├── pnpm-workspace.yaml
└── package.json     — Root monorepo package
```

Key subdirectories in apps/web/src/:
- `app/api/` — 100+ Next.js route handlers
- `app/(dashboard)/` — Dashboard pages (accounts, contacts, deals, chat, meetings, sequences, tasks, notes, deliverability, reports, settings, objects)
- `app/(marketing)/` — Landing page, pricing, legal pages
- `lib/chat/tools/` — 13 tool files (126 tools for AI agent)
- `lib/prompts/` — Centralized prompt templates (3 files)
- `lib/agents/` — Agent orchestration (capability-resolver.ts)
- `lib/evals/` — Evaluation framework (agent-evals.ts)
- `lib/guardrails/` — Safety filters (approval-mode, sending-identity, trust-score)
- `skills/` — 29 skill handlers (enrichment, intelligence, outreach)
- `inngest/` — 18+ Inngest workflow files
- `db/` — Drizzle schema, migrations, indexes
- `__tests__/` — 100+ test files

---

## Section 3 — Paths critiques pour audit agent

| Rubrique | Path | Status |
|----------|------|--------|
| Orchestration agent | apps/web/src/lib/agents/capability-resolver.ts | PRESENT — gates tools by role, plan tier, surface, destructive-ops flag |
| Definition des tools | apps/web/src/lib/chat/tools/*.ts (13 files) | PRESENT — 126 tools |
| System prompts | apps/web/src/lib/prompts/chat-system-prompt.ts | PRESENT — ~4,552 tokens |
| Shared prompt rules | apps/web/src/lib/prompts/shared-rules.ts | PRESENT — ~878 tokens (ANTI_HALLUCINATION_RULES, QUALITY_RUBRIC, EMAIL_RULES) |
| Email few-shot examples | apps/web/src/lib/prompts/email-examples.ts | PRESENT — ~3,298 tokens, 12 golden examples |
| RAG / retrieval | apps/web/src/lib/embeddings.ts + db/ensure-vector-index.ts | PRESENT — pgvector semantic search via searchSimilar() |
| Memory cross-session | apps/web/src/lib/agent-memory.ts + chatMemories table | PRESENT — 6 memory categories (inferred-from-website, inferred-from-inbox, explicit-setting, user-provided-knowledge, past-conversation-summary, learned-preference) |
| Evals | apps/web/src/lib/evals/agent-evals.ts (1,191 lines) + lib/eval-runner.ts | PRESENT — 13 grader types |
| Tracing / observability | apps/web/src/lib/observability.ts + agentTraces table + Sentry | PRESENT — AGENT_REGISTRY with 25+ agents, quality thresholds, latency budgets, cost caps, 10% online eval sampling |
| Model routing / multi-provider | apps/web/src/lib/chat/tools/action.ts:35-40 (pickModel) | PRESENT — Anthropic claude-sonnet-4-6 primary, gpt-4o-mini fallback |
| Guardrails / safety filters | apps/web/src/lib/guardrails/ (3 files) + lib/chat/prompt-safety.ts | PRESENT — approval-mode, sending-identity, trust-score; prompt injection hardening with XML tag wrapping |
| Skills (handlers) | apps/web/src/skills/ (29 handler.ts files) | PRESENT — enrichment (4), intelligence (10), outreach, others |
| MCP server | apps/web/src/app/api/mcp/route.ts | PRESENT — JSON-RPC 2.0, 11 CRM tools, bcrypt API key auth |
| MCP client | ABSENT | — |
| Sandboxing code execution | ABSENT | No Modal/E2B/Daytona |
| Fine-tuning datasets | ABSENT | — |
| A/B testing prompts | apps/web/src/lib/experiments.ts | PRESENT — 4 DB-backed feature flags |
| Multi-provider enrichment | apps/web/src/lib/providers/company-enrichment/registry.ts | PRESENT — Waterfall registry (Apollo -> LLM fallback) |

---

## Section 4 — Inventaire des prompts

| Path | Taille (tokens approx) | Volatilite (6 mois) | Eval associee |
|------|------------------------|----------------------|----------------|
| lib/prompts/chat-system-prompt.ts | ~4,552 tokens (18,206 chars) | 8 commits | OUI — agentTraces + eval framework |
| lib/prompts/shared-rules.ts | ~878 tokens (3,510 chars) | 3 commits | PARTIEL — graded via agentTraces.eval_score |
| lib/prompts/email-examples.ts | ~3,298 tokens (13,193 chars) | 3 commits | OUI — few-shot tracked in agentFewShotExamples table |

Prompt safety: lib/chat/prompt-safety.ts (lines 54-83) — XML tag wrapping for untrusted input, control char stripping, zero-width removal, delimiter escaping, 10k char cap.

Extended thinking enabled (chat-system-prompt.ts:180) — inference-optimized for coaching/analysis.

Prompts are centralized (3 files). Zero inline prompts in API routes detected.

---

## Section 5 — Inventaire des tools exposes au modele

**Total: 126 tools across 13 files + 11 MCP server tools = 137 total**

| Module | File | Count | Idempotent |
|--------|------|-------|------------|
| Query | lib/chat/tools/query.ts | 24 | OUI (read-only) |
| Create | lib/chat/tools/create.ts | 18 | NON |
| Update | lib/chat/tools/update.ts | 9+ | NON |
| Action | lib/chat/tools/action.ts | 18 | NON (side effects: emails, enrollments) |
| Intelligence | lib/chat/tools/intelligence.ts | 4 | OUI |
| Skills | lib/chat/tools/skills.ts | 26 | NON (external APIs) |
| Memory | lib/chat/tools/memory.ts | 4 | NON (forgetMemory deletes) |
| Briefing | lib/chat/tools/briefing.ts | 3 | OUI |
| Coaching | lib/chat/tools/coaching.ts | 3 | OUI |
| Schema | lib/chat/tools/schema.ts | 2 | OUI |
| Undo | lib/chat/tools/undo.ts | 1 | NON |
| MCP Server | app/api/mcp/route.ts | 11 | MIXED |

Tool gating: capability-resolver.ts gates by role (admin/member), plan tier (free/starter/pro), surface (global/contact/account/deal/meeting/list), destructive-ops flag. Skills tools (26) require pro tier.

---

## Section 6 — Flows demo detectes

### Flow 1 — TAM batch (ICP -> Apollo -> CRM)
- Entrypoint: api/campaigns/prepare/route.ts
- Inngest: prepareCampaign (campaign-functions.ts:27-56) — 5 steps: select-segment, enrich-companies, discover-contacts, score & enroll, finalize
- Components: apollo-client.ts (enrichOrganization, searchPeople), contact-scoring.ts (scoreContact), sequence-generator.ts (personalizeStepEmail)
- Persistence: companies, contacts, sequenceEnrollments, sequenceSteps
- Status: DETECTED

### Flow 2 — Gmail/Outlook OAuth -> sync -> CRM
- Entrypoint: NextAuth providers (Google, Microsoft Entra ID)
- Sync: inngest/sync-functions.ts:92 (syncEmails — fetches via Gmail API, analyzes sentiment with Haiku, creates activities)
- Calendar: api/calendar/sync/route.ts (fetchRecentMeetings, 30 past + 14 future days)
- Auto-creates contacts from email attendees
- Meeting bot: Recall.ai createBot()
- Persistence: authAccounts, activities (email/meeting), contacts
- Status: DETECTED

### Flow 3 — Campaigns/Sequences
- Entrypoint: api/campaigns/generate/route.ts + api/campaigns/prepare/route.ts
- Sequence gen: sequence-generator.ts STEP_STRATEGIES, personalizeStepEmail()
- Sending: inngest/email-send-worker.ts, inngest/signal-to-sequence.ts
- Tracking: api/track/open, api/track/click, webhook handlers
- Persistence: sequences, sequenceSteps, sequenceEnrollments, outboundEmails
- Status: DETECTED

### Flow 4 — Calls/Meetings -> transcription -> notes -> follow-up
- Entrypoint: api/meetings/upload-transcript/route.ts
- Processing: inngest/meeting-functions.ts (cronCalendarSync every 15min)
- Notes: api/meetings/[id]/notes/route.ts (LLM summary + follow-up draft)
- Follow-up: api/meetings/[id]/notes/send-follow-up (via Resend or connected mailbox)
- Persistence: activities (meeting_scheduled/completed + metadata), tasks, outboundEmails
- Status: DETECTED (transcription via Recall.ai)

### Flow 5 — Dashboard/Chat
- Entrypoint: api/chat/route.ts (streaming via tracedStreamText)
- Model: claude-sonnet-4-6 primary, gpt-4o-mini fallback
- Tool selection: buildAllChatTools() with capability resolver
- RAG: searchSimilar() (embeddings), searchContextGraph()
- Context: buildChatSystemPrompt() injects CRM snapshot + preferences
- Citations: formatCitedSources() with entity links
- Compaction: message summarization for long conversations
- Persistence: chatThreads, chatMessages, chatMemories
- Status: DETECTED

---

## Section 7 — Schema DB

Framework: Drizzle ORM (PostgreSQL via Neon serverless)
Schema file: apps/web/src/db/schema.ts (1,611 lines)
Total tables: 44+

Key tables:

| Table | Role | tenantId | Key Indexes | Soft delete |
|-------|------|----------|-------------|-------------|
| tenants | Workspace root | N/A (primary) | — | NON |
| users | Team members | OUI | (tenantId), (clerkId) | NON |
| companies | Accounts | OUI | (tenantId), (domain), (logoResolvedAt) | NON |
| contacts | People | OUI | (tenantId), (companyId), (email) | NON |
| deals | Opportunities | OUI | (tenantId), (companyId), (stage) | NON |
| activities | Events (email/meeting/call/note) | OUI | (tenantId), (entityType+entityId), (type), (threadId) | NON |
| notes | Written observations | OUI | (tenantId), (entityType+entityId) | NON |
| tasks | To-do items | OUI | (tenantId), (assignee), (dueDate), (status) | NON |
| sequences | Email campaigns | OUI | (tenantId), (status) | NON |
| sequenceSteps | Campaign steps | OUI (via FK) | (sequenceId), (sequenceId+stepType) | NON |
| sequenceEnrollments | Contacts in campaigns | OUI (via FK) | (sequenceId), (contactId), (nextStep) | NON |
| outboundEmails | Sent messages | OUI | (tenantId), (status), (mailbox), (enrollment), (sent) | NON |
| connectedMailboxes | Sending accounts | OUI | (tenantId), (status), (domain), (tenantId+email UNIQUE) | NON |
| chatThreads | Conversation threads | OUI | (tenantId), (userId) | NON |
| chatMessages | Chat utterances | OUI (via FK) | (threadId), (branchId), (parentMessageId) | NON |
| chatMemories | Persistent agent context | OUI | (tenantId+userId), (category), (scope) | NON |
| toolCallEvents | Tool audit + undo | OUI | (tenantId+userId), (toolName), (threadId) | NON |
| agentTraces | Observability | OUI (optional) | (tenantId), (agentId), (traceId), (status) | NON |
| agentPromptVersions | Versioned prompts | N/A (agentId string) | (agentId), (agentId+isActive) | NON |
| contextGraphNodes | Knowledge graph entities | OUI | (tenantId), (entityType+entityId), (name) | NON |
| contextGraphEdges | Entity relationships | OUI | (tenantId), (relation), (bi-temporal valid/invalid) | NON |
| inboundVisitors | Website pixel tracking | OUI | (tenantId), (sessionId), (lastSeen) | NON |
| signalOutcomes | Signal attribution | OUI | (tenantId), (tenantId+signalType) | NON |
| agentActions | Reversible agent ops | OUI | (tenantId+created), (status) | NON |
| trustEvents | Trust score audit trail | OUI | (tenantId+created), (eventType) | NON |
| evalDatasets | Eval pipeline | OUI | (tenantId) | NON |
| evalCases | Eval test cases | OUI | — | NON |
| evalRuns | Eval executions | OUI | (tenantId) | NON |
| evalResults | Eval results | OUI | — | NON |
| comments | Threaded comments | OUI | (tenantId+entityType+entityId), (parentCommentId) | NON |
| notifications | In-app alerts | OUI | (userId), (tenantId), (read) | NON |
| sharedPrompts | Saved queries | OUI | (tenantId+scope), (authorId) | NON |
| notetakerExposures | Meeting bot attribution | OUI | (emailAt), (activityId) | NON |
| customSignals | User-defined signals | OUI | (tenantId) | NON |
| customSkillTemplates | Skill templates | OUI | (tenantId) | NON |

**Tenant isolation**: ALL 44+ business tables have tenantId FK with .notNull(). Isolation is application-layer via Drizzle WHERE clauses (eq(table.tenantId, tenantId)). **No PostgreSQL RLS.**

**Soft delete**: NOT USED. Deletions are physical with CASCADE policies. Audit trail via toolCallEvents (snapshot + reverse for undo).

---

## Section 8 — Secrets & .env

**.env.example** exists at apps/web/.env.example with placeholder values. Properly structured.

**.env.local** exists on disk at apps/web/.env.local — NOT committed to git.

**.gitignore** (root): `.env*` on line 3, `!.env.example` on line 4. Correctly excludes all env files except the example.

**Secret scan**: `git ls-files | grep -i '\.env'` returns only `apps/web/.env.example`. No secrets in git history.

Variable classification:

| Category | Variables | Count |
|----------|-----------|-------|
| Provider external | ANTHROPIC_API_KEY, OPENAI_API_KEY, APOLLO_API_KEY, RESEND_API_KEY, RECALL_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_SECRET | 9 |
| Internal infra | DATABASE_URL, AUTH_SECRET, ELEVAY_APP_SECRET, ENCRYPTION_KEY, REDIS_URL, EMAILENGINE_WEBHOOK_SECRET, INNGEST_SIGNING_KEY | 7 |
| Feature flags | ENABLE_E2E_SEED, NEXT_PUBLIC_APP_ENV | 2 |
| Public (safe) | NEXT_PUBLIC_STRIPE_*_PRICE_ID, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST, NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_APP_URL, GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID, OPS_EMAIL_ADDRESS, INVITE_FROM_ADDRESS | 9 |

**Sentry scrubbing** present in lib/sentry-scrub.ts: redacts Bearer tokens, sk_*, pk_*, AKIA, whsec_, JWTs, bcrypt hashes, emails from error reports.

---

## Section 9 — CI/CD

**GitHub Actions**: ABSENT. No .github/workflows/ directory.

**Vercel deployment**: apps/web/vercel.json with security headers and 5 cron routes:
- /api/cron/email-sync — every 15 min
- /api/cron/stale-deals — daily 8am UTC
- /api/cron/world-model — daily 2am UTC
- /api/cron/mailbox-reset — daily midnight UTC
- /api/cron/deal-progression — daily 9am & 9pm UTC

**Security headers** (vercel.json): X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-XSS-Protection: 1; mode=block, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=(), microphone=(), geolocation=().

| Workflow | Trigger | Steps | Eval gate | Canary |
|----------|---------|-------|-----------|--------|
| Vercel auto-deploy | Git push | build (Next.js) | NON | NON |

**Gaps**: No pre-merge CI pipeline. No lint/typecheck/test gate. No eval gate. No canary. Deployment relies entirely on Vercel's automatic build.

---

## Section 10 — Conventions repo

- **Naming**: camelCase for variables/functions, kebab-case for directories/files, PascalCase for components
- **Folder structure**: Feature-based within app/(dashboard)/, layer-based for lib/ (prompts, agents, chat, guardrails, providers)
- **Custom abstractions**:
  - Agent orchestration: lib/agents/capability-resolver.ts (SurfaceContext-based tool gating)
  - Observability registry: lib/observability.ts (AGENT_REGISTRY with per-agent quality/latency/cost configs)
  - Trust score system: lib/guardrails/trust-score.ts (append-only trust events)
  - Skills framework: src/skills/ (29 handlers with enrichment/intelligence/outreach categorization)
  - Tool call events: db schema toolCallEvents (full audit trail with snapshot + undo)
  - Bi-temporal knowledge graph: contextGraphEdges (tValid/tInvalid/tCreated/tExpired)
- **CLAUDE.md**: Present at root. Detailed autonomous build harness instructions, research methodology, eval rubric references, operational rules.
- **AGENTS.md**: ABSENT
- **CONTRIBUTING.md**: ABSENT
- **README.md**: ABSENT (or minimal)

---

## Section 11 — Detection capacites-cles

| Capacite | Detection | Evidence |
|----------|-----------|----------|
| MCP server (expose tools en MCP) | OUI | api/mcp/route.ts — JSON-RPC 2.0, 11 tools, bcrypt API key auth |
| MCP code execution mode | NON | — |
| Skills (folders SKILL.md) | OUI | src/skills/ — 29 handler.ts files |
| Prompt caching Anthropic active | NON | Zero cache_control in codebase |
| Batch API Anthropic | NON | — |
| Multi-provider abstraction layer | OUI | lib/providers/company-enrichment/registry.ts (waterfall pattern) |
| Region pinning EU | NON | — |
| Reranker (Cohere/Voyage/cross-encoder) | NON | — |
| Hybrid search (dense + BM25) | NON | Semantic only (pgvector embeddings) |
| Citation/groundedness checker | OUI | api/chat/route.ts formatCitedSources() with entity links |
| Memory long-terme dediee | OUI | chatMemories table, 6 categories, TTL support |
| Sandbox d'execution reel | NON | — |
| Eval suite agentique | OUI | agent-evals.ts (1,191 lines), 13 grader types, eval-runner.ts |
| Golden traces / replay infrastructure | OUI | 100+ test files in __tests__/, eval datasets in DB |
| Drift detection | PARTIEL | Eval runner compares run scores, no automated alerting |
| Cost-of-failure matrix | NON | LLM budget tracking exists but not tied to failure costs |
| Eval gate au merge | NON | — |
| Canary deployment prompts | NON | — |
| Postmortems | NON | — |
| Runbook | NON | — |

---

## Section 12 — Metriques de scale du repo

| Metrique | Valeur |
|----------|--------|
| LOC total (TS/TSX) | ~48,000 |
| Fichiers TS | ~800 |
| Fichiers TSX | ~307 |
| Fichiers de test | 100+ |
| Ratio test:code | ~10-12% (files), coverage unknown |
| Contributeurs 6 mois | 1 (Martin + Claude Code co-authored) |
| Commits totaux | 562 |
| Commits 6 mois | 533 |
| Commits/semaine moyenne | ~20.5 |
| Package manager | pnpm 10.15.1 |
| Monorepo tool | Turborepo 2.9.0 |
| Apps | 3 (web, admin, worker) |
| Packages | 2 (database, shared) |

---

## Section 13 — Red flags immediats (factuels)

1. **126 tools exposes a un seul agent chat** — risque de confusion et de token overhead dans le tool selection
2. **Zero prompt caching** — aucune reference cache_control, chaque requete re-envoie le system prompt complet (~4,552 tokens)
3. **Zero CI/CD pipeline** — pas de GitHub Actions, pas de pre-merge gate (lint, typecheck, test, eval)
4. **Zero eval gate au merge** — evals existent mais ne bloquent pas les deploys
5. **Application-layer tenant isolation uniquement** — pas de PostgreSQL RLS, un bug dans l'injection tenantId = data leak cross-tenant
6. **NextAuth en beta** — next-auth 5.0.0-beta.30, pas de version stable
7. **1 contributeur unique** — bus factor = 1
8. **Region pinning EU absent** — malgre les claims GDPR sur la landing/legal
9. **Pas de hybrid search** — semantic only (pgvector), pas de BM25 full-text complement
10. **12 bugs documentes non resolus** — 5 severity S2 incluant dead UI et placeholder features
11. **Pas de canary deployment pour les prompts** — changement de prompt = deploy immediat a 100%
12. **Pas de postmortem/runbook** — zero incident tracking structure
13. **Zero DPA signe avec sub-processors** — claims legales non verifiees

---

## Section 14 — Limites de la cartographie

- Pas d'acces aux logs prod Vercel — impossible de mesurer latence reelle, error rate, token consumption
- Pas d'acces au dashboard Sentry — impossible de verifier les error patterns et crash rates
- Pas d'acces au dashboard Stripe — impossible de verifier les abonnements actifs et MRR
- Pas d'acces au dashboard PostHog — impossible de verifier DAU, retention, feature adoption
- Pas d'acces au dashboard Inngest — impossible de verifier les taux de succes des background jobs
- Pas d'acces staging — impossible de tester les flows en conditions reelles
- Variables d'env non disponibles en lecture — impossible de verifier si prompt caching est configure en runtime (bien que le code n'ait aucune reference)
- Pas de Recall.ai dashboard — impossible de verifier le taux de succes de la transcription
- Coverage test non mesurable sans execution — ratio fichiers connu mais coverage lines/branches inconnue
