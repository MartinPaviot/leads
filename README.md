# Elevay

Autonomous GTM engine for founder-led sales. Chat-first CRM that captures every customer interaction, scores leads with ML, and runs outbound sequences -- zero manual data entry.

## Architecture

Turborepo monorepo under `app/`:

```
app/
  apps/
    web/          Next.js 15 -- main product (dashboard, chat, API, Inngest workers)
    admin/        Internal ops console (agent traces, flywheel, channel monitoring)
    worker/       Background queue workers (send, reply, warmup, health)
  packages/
    database/     Shared Drizzle schema + migrations
    shared/       Cross-app types and utilities
```

## Tech stack

| Layer | Stack |
|---|---|
| Framework | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Database | PostgreSQL (Neon), Drizzle ORM, pgvector |
| Auth | Auth.js v5 (Google OAuth, Microsoft Entra, credentials) |
| AI | Vercel AI SDK, Anthropic Claude, OpenAI (embeddings + fallback) |
| Background jobs | Inngest (31 functions), Vercel Cron (5 jobs) |
| Email | Resend (transactional), EmailEngine (sync) |
| Billing | Stripe (subscriptions, usage-based) |
| Enrichment | Apollo.io (company/contact data) |
| Meetings | Recall.ai (auto-join, record, transcribe) |
| Observability | Sentry, PostHog |

## Setup

```bash
git clone git@github.com:MartinPaviot/leads.git
cd leads/app
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in keys
pnpm dev
```

Requires: Node 20+, pnpm 10+, PostgreSQL (or Neon connection string).

## Testing

```bash
pnpm test          # 1186 unit/integration tests (Vitest)
pnpm tsc           # full TypeScript type check
pnpm eval:run      # agent eval suite (golden-case + flywheel evals)
```

113 test files across the web app. E2E tests via Playwright (`pnpm e2e`).

## Key directories

| Path | Purpose |
|---|---|
| `apps/web/src/app/api/` | 73 API route groups (chat, billing, enrichment, cron, webhooks, ...) |
| `apps/web/src/lib/chat/tools/` | 126 chat tools across 11 categories (query, create, update, action, memory, intelligence, skills, undo, briefing, coaching, schema) |
| `apps/web/src/lib/guardrails/` | Trust score, approval mode, sending identity enforcement |
| `apps/web/src/lib/agents/` | Capability resolver -- per-turn tool filtering by role, surface, feature flags |
| `apps/web/src/lib/prompts/` | System prompts (chat, email, shared rules) |
| `apps/web/src/lib/evals/` | Agent eval framework (golden cases, flywheel metrics) |
| `apps/web/src/inngest/` | 31 background functions (enrichment, sync, coaching, signals, pipelines) |
| `apps/web/src/db/` | Drizzle schema (1632 lines), RLS policies, vector index setup |
| `apps/web/src/lib/context-graph.ts` | Bi-temporal knowledge graph (entity extraction, resolution, hybrid retrieval) |

## Deployment

Vercel auto-deploy on merge to `main`. Five cron jobs:

| Job | Schedule |
|---|---|
| Email sync | Every 15 min |
| Stale deals | Daily 08:00 |
| World model rebuild | Daily 02:00 |
| Mailbox reset | Daily 00:00 |
| Deal progression | Twice daily (09:00, 21:00) |

## Security

- **CODEOWNERS**: PR review required for prompts, agents, guardrails, evals, schema, chat route, MCP server
- **Signed audit trail**: HMAC-SHA256 on every audit row, tamper-detectable
- **RLS**: Row-level security via application-layer tenant isolation
- **Rate limiting**: Per-tenant, per-endpoint rate limit enforcement
- **GDPR**: EU region pinning for Anthropic API + database, configurable via env
- **Security headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy (vercel.json)
- **SSRF guard**: Outbound fetch validation (`ssrf-guard.ts`)
- **Encryption**: Tenant secrets encrypted at rest with `ELEVAY_APP_SECRET`

## AI architecture

- **126 chat tools** resolved per-turn by the capability resolver (role + surface + feature flags + destructive gating)
- **4-layer guardrails**: capability resolver (tool access), approval mode (human-in-the-loop gating), sending identity (deliverability protection), progressive trust score (autonomy escalation)
- **Hybrid search**: BM25 full-text + pgvector embeddings + Reciprocal Rank Fusion (RRF) via the context graph
- **Circuit breakers**: Automatic fallback (Anthropic down -> OpenAI, Apollo down -> queue for retry)
- **Bi-temporal knowledge graph**: Entity extraction, resolution, edge invalidation with full history preservation
