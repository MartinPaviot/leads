# Framework & Infrastructure Research Report

**Date:** 2026-03-30
**Purpose:** Select the optimal tech stack for a chat-first, AI-heavy autonomous GTM engine targeting early-stage founders doing founder-led sales.

**Key constraints:** Chat-first UI, heavy LLM streaming, background enrichment/sequences, customer memory with NL queries, zero manual data entry, real-time updates, solo/small team building it.

---

## Table of Contents

1. [Frontend Framework](#1-frontend-framework)
2. [Backend / Runtime](#2-backend--runtime)
3. [Database](#3-database)
4. [Real-Time / Streaming](#4-real-time--streaming)
5. [Authentication](#5-authentication)
6. [Email Infrastructure](#6-email-infrastructure)
7. [Queue / Job System](#7-queue--job-system)
8. [Vector Database / RAG Infrastructure](#8-vector-database--rag-infrastructure)
9. [Deployment](#9-deployment)
10. [AI / LLM Integration Patterns](#10-ai--llm-integration-patterns)
11. [Monorepo vs Separate Services](#11-monorepo-vs-separate-services)
12. [Final Stack Recommendation](#12-final-stack-recommendation)

---

## 1. Frontend Framework

### Why this matters for us
The entire product is a chat interface. The framework must handle streaming LLM responses, real-time updates, and progressive rendering natively. This is not a content site or a CRUD dashboard.

### Options Evaluated

#### Next.js 16 (current stable, App Router) — 9/10

**Maturity:** Dominant. Largest ecosystem, most hiring pool, most tutorials, most third-party integrations. Now on v16.2 (March 2026) with Turbopack stable as default bundler.

**Why it wins for chat-first AI:**
- Native streaming via React Server Components and Suspense boundaries
- Vercel AI SDK 6 is built specifically for Next.js — `useChat`, `useCompletion`, `useObject` hooks work out of the box
- `streamUI` function lets LLMs return React components directly
- Partial Prerendering (PPR) for instant static shells with dynamic streaming holes
- Server Actions for mutations without API boilerplate
- 16.2 ships agent-ready tooling: `AGENTS.md`, browser log forwarding, dev server lock files, Agent DevTools
- Turbopack: 87% faster startup vs 16.1, 350% faster RSC payload deserialization

**Cost at scale:**
- 10 users: Free on Vercel hobby
- 100 users: $20/mo Vercel Pro
- 1000 users: $20/mo + usage (~$50-150/mo depending on serverless invocations)

**Weaknesses:**
- Vercel-centric ecosystem (though deployable anywhere)
- Complexity of App Router caching model (improved in v16 with explicit `use cache`)
- Serverless function timeout limits on Vercel (can work around with streaming)

#### SvelteKit — 7/10

**Maturity:** Growing. Svelte 5 runes system is stable. Ships 50-70% less JavaScript than React frameworks.

**Strengths:** Best raw performance, smallest bundles, most intuitive reactivity model. Excellent DX.

**Critical weakness for this project:** The Vercel AI SDK has SvelteKit support, but it is second-class compared to Next.js. The ecosystem of chat components, AI templates, and production examples is 10x smaller. You would be building more from scratch. Svelte's hiring pool is also significantly smaller.

#### Remix (now React Router v7) — 6/10

**Maturity:** Merged into React Router v7. Remix 3 is being reimagined as batteries-included and bundler-free.

**Strengths:** Web-standards-first, excellent form handling, progressive enhancement.

**Critical weakness for this project:** The loader/action pattern is optimized for form-based CRUD, not streaming chat. React Router v7 merger created transition confusion. Less AI-specific tooling. Community momentum has shifted.

#### Astro — 4/10

Not applicable. Astro is content-site-first with island architecture. Wrong paradigm for a chat-first SaaS app.

### VERDICT: Next.js 16 (App Router)

The AI SDK integration alone makes this a clear winner. For a chat-first product, the combination of streaming RSC, `useChat` hooks, Server Actions, and the largest ecosystem of AI chat examples is decisive. The 16.2 agent tooling is a bonus for our AI-heavy development workflow.

---

## 2. Backend / Runtime

### Why this matters for us
The backend must handle: LLM API calls (long-running, streaming), background enrichment jobs, email sequence execution, webhook ingestion, and real-time subscriptions. It is I/O-bound, not CPU-bound.

### Options Evaluated

#### Node.js 22 LTS — 7/10

**Maturity:** 15 years of production hardening. Every npm package works. Every cloud provider supports it natively.

**Performance:** ~45,000 req/sec raw HTTP.

**Strengths:** Maximum ecosystem compatibility, proven at any scale, predictable behavior.

**Weaknesses:** Slower than alternatives, larger memory footprint, npm dependency management overhead.

#### Bun 1.2+ — 8/10

**Maturity:** Production-ready since Bun 1.0 (Sept 2023). Now 2.5 years of production hardening. Widely adopted for greenfield projects.

**Performance:** ~120,000 req/sec raw HTTP (2.4x Node), 4.6x faster cold starts, package installs in 2 seconds vs npm's 18 seconds.

**Strengths:** Built-in bundler, test runner, package manager. Native TypeScript execution (no transpilation step). SQLite driver built in. WebSocket server built in. S3 client built in.

**Weaknesses:** 15 critical npm packages with native code have compatibility issues. Smaller community for debugging edge cases. Less battle-tested for 5+ year production runs.

**Cost impact:** 60-70% infrastructure cost reduction vs Node.js for equivalent workloads due to lower memory and faster execution.

#### Go — 6/10

**Maturity:** Excellent. Battle-tested at massive scale (Docker, Kubernetes, etc.).

**Performance:** Sub-millisecond response times, 10,000+ req/sec on standard hardware via goroutines.

**Critical weakness for this project:** Splits the stack. You lose full-stack TypeScript, shared types between frontend and backend, shared validation schemas, and the ability to use Vercel AI SDK server-side. The AI/LLM ecosystem in Go is immature compared to TypeScript. For a solo/small team, maintaining two languages is overhead that buys nothing for an I/O-bound workload.

#### Rust — 5/10

**Maturity:** Excellent for systems programming.

**Performance:** 2-3x faster than Go, 5-10x faster than Node on benchmarks.

**Critical weakness for this project:** Same stack-splitting problem as Go but worse. Development velocity is significantly slower. The AI ecosystem is nearly nonexistent. Overkill for I/O-bound API calls to LLM providers. The performance ceiling we need is "handle streaming responses from OpenAI," not "process 1M concurrent TCP connections."

### VERDICT: Bun

For a greenfield, chat-first AI SaaS in 2026, Bun is the right choice. The performance gains are real and meaningful (faster cold starts for serverless, lower memory for streaming connections). Built-in TypeScript, test runner, and package manager reduce tooling complexity. The compatibility risks are manageable for a greenfield project where you control dependency choices.

**Fallback plan:** If any critical dependency has Bun incompatibility, Node.js 22 is a zero-friction fallback since the code is the same TypeScript.

---

## 3. Database

### Why this matters for us
We need: relational data (accounts, contacts, deals, sequences), vector embeddings (customer memory, NL queries), real-time subscriptions (live pipeline updates), and branching (safe migrations, preview environments).

### Options Evaluated

#### Neon (Serverless PostgreSQL) — 9/10

**Maturity:** Acquired by Databricks in 2025 for ~$1B. Now the Postgres foundation for Databricks' agentic AI platform. 80%+ of databases provisioned on the platform are created by AI agents.

**Key features:**
- Scale-to-zero: compute shuts down when idle, charges by the second
- Copy-on-write branching: create a full database branch in <1 second, near-zero additional storage
- Separation of compute and storage: scale independently
- pgvector support: vector embeddings in the same database as relational data
- MCP integration: natural language database management for AI agents
- Point-in-time recovery

**Pricing (2026, post-reduction):**
- Free: 100 CU-hours/mo, 0.5GB storage
- Launch: $19/mo ($0.106/CU-hour, $0.35/GB-month storage)
- Scale: $69/mo ($0.222/CU-hour)

**Cost at scale:**
- 10 users: Free tier likely sufficient
- 100 users: ~$19-40/mo (Launch plan)
- 1000 users: ~$69-150/mo (Scale plan)

**Strengths for this project:** Branching for safe preview deployments. Scale-to-zero for cost efficiency during early growth. pgvector means no separate vector database needed until >10M vectors. Full PostgreSQL compatibility.

#### Supabase (PostgreSQL BaaS) — 8/10

**Maturity:** The most popular "Firebase alternative." Full platform: database + auth + storage + realtime + edge functions.

**Key features:**
- Built-in auth, real-time subscriptions (10K+ concurrent connections), storage, edge functions
- pgvector support for AI embeddings
- Row Level Security for multi-tenant isolation
- Real-time via PostgreSQL logical replication
- New Warehouse feature with pg_duckdb for analytics

**Pricing:**
- Free: 500MB database, 50K monthly active users auth
- Pro: $25/mo per project
- Team: $599/mo

**Strengths:** All-in-one platform reduces service count. Real-time is built in. Auth is built in.

**Weaknesses vs Neon:** No scale-to-zero (always-on even on free tier), no copy-on-write branching, platform lock-in (harder to migrate away), less granular cost control. The "all-in-one" advantage becomes a liability when you want best-in-class for each component.

#### PlanetScale (MySQL/Vitess) — 5/10

**Maturity:** Battle-tested Vitess backend. Gold standard for scaling MySQL.

**Critical weakness:** MySQL, not PostgreSQL. No pgvector (would need a separate vector database). No free tier ($39/mo minimum). The PostgreSQL ecosystem for AI (pgvector, pgvectorscale, pg_embedding) is vastly superior. Wrong database engine for an AI-heavy product.

#### Turso (Edge SQLite/libSQL) — 6/10

**Maturity:** Edge-native SQLite. Written in Rust. Lowest latency of any option (<130ms for 5 queries).

**Strengths:** Best latency, generous free tier (9GB), edge replication.

**Critical weakness:** SQLite's single-writer model limits write throughput. Not suitable for a product that needs concurrent writes from enrichment jobs, sequence execution, and user interactions simultaneously. No pgvector equivalent. Limited relational capability for complex queries across accounts/contacts/deals.

### VERDICT: Neon

Neon wins on every dimension that matters for this project. Scale-to-zero keeps costs near zero during early growth. Copy-on-write branching enables safe migrations and preview environments. pgvector means one database for both relational and vector data (eliminating an entire service). Full PostgreSQL compatibility means zero lock-in. The Databricks acquisition ensures long-term investment.

**Note on Supabase:** If we needed real-time subscriptions and auth bundled in, Supabase would be compelling. But we are going to use separate best-in-class tools for auth (Better Auth) and real-time (SSE/WebSocket), so the bundling provides no benefit while adding platform dependency.

---

## 4. Real-Time / Streaming

### Why this matters for us
The entire product is a chat interface that streams LLM responses. We also need live pipeline updates, deal stage changes, and enrichment notifications.

### Architecture: SSE for LLM streaming + WebSocket for bidirectional updates

#### LLM Response Streaming: Server-Sent Events (SSE) over HTTP/3 — 9/10

**Why SSE for LLM responses:**
- Unidirectional (server-to-client) which is exactly what LLM streaming is
- No protocol upgrade handshake — instant Time-To-First-Byte over HTTP/3
- Works through firewalls, CDNs, and proxies without special configuration
- Vercel AI SDK uses SSE natively for `streamText` and `streamUI`
- Automatic reconnection built into the browser EventSource API
- Firewall-friendly: runs on standard HTTP ports

**Performance:** In 2026, SSE over HTTP/3 outperforms WebSockets for TTFB. The absence of a protocol upgrade handshake means bytes flow immediately.

#### Bidirectional Updates: WebSocket (via Bun built-in) — 8/10

**Why WebSocket for bidirectional:**
- Pipeline updates, presence, collaborative features need bidirectional communication
- Bun has a built-in WebSocket server (no additional dependency)
- ~1M concurrent connections per server on Bun

**Alternative considered: Supabase Realtime (7/10)** — Good but adds platform dependency for something Bun handles natively.

**Alternative considered: Pusher/Ably (6/10)** — Adds cost and external dependency for something we can self-host.

### VERDICT: SSE for AI streaming (via Vercel AI SDK) + Bun native WebSocket for bidirectional updates

This is the standard pattern for AI chat apps in 2026. The AI SDK handles all SSE complexity. Bun handles WebSocket natively. No additional services needed.

---

## 5. Authentication

### Why this matters for us
We need: email/password, social login (Google), magic links, organization/team support (for B2B), and eventually API keys for integrations. Must be self-hostable (no vendor lock-in for a core feature).

### Options Evaluated

#### Better Auth — 9/10

**Maturity:** The recommended successor to Lucia (deprecated March 2025). Growing rapidly in 2026. Framework-agnostic TypeScript library.

**Key features:**
- Email/password, magic links, OAuth (Google, GitHub, etc.), passkeys
- 2FA, phone OTP, organization roles, audit logs via plugin ecosystem
- Enterprise SSO, SAML 2.0, SCIM provisioning
- Auth for AI agents: MCP server auth, async auth flows, token exchange, agent-to-agent delegation
- Bot detection, real-time behavior analysis, IP blocking
- No vendor lock-in: you own your auth data in your own database

**Pricing:** Free (open source, MIT license). Self-hosted. Zero per-user costs ever.

**Cost at scale:**
- 10 users: $0
- 100 users: $0
- 1000 users: $0
- 100,000 users: $0

**Strengths for this project:** AI agent auth is uniquely relevant. Plugin architecture means we add features (2FA, org management) when needed without migration. Zero cost at any scale. Data lives in our Neon database.

**Weaknesses:** Younger than Clerk/Auth.js. Smaller community. No pre-built UI components (must build login forms). No SOC 2 compliance features out of the box.

#### Clerk — 7/10

**Maturity:** Most polished auth-as-a-service. Best pre-built UI components. SOC 2 Type 2 certified.

**Key features:**
- Pre-built React components for sign-in, sign-up, organization management
- Native Next.js App Router integration with middleware
- 10,000 MAU free tier

**Pricing:** Free up to 10K MAU. Pro: $25/mo + $0.02/MAU.

**Cost at scale:**
- 10 users: $0
- 100 users: $0
- 1000 users: $0 (under 10K MAU)
- 10,000 users: $25 + $0/MAU = $25/mo
- 50,000 users: $25 + (40K * $0.02) = $825/mo

**Critical weakness:** Vendor lock-in. Auth data lives on Clerk's servers. Migration is painful. Per-MAU pricing becomes expensive at scale. For a product targeting founder-led sales at early-stage startups, the free tier is generous, but the dependency on an external service for a core function (who can log in) is a strategic risk.

#### Auth.js (NextAuth v5) — 6/10

**Maturity:** The old default. Rebranded as Auth.js. 80+ OAuth providers.

**Weaknesses:** No built-in organization support. No 2FA. No passkeys. Documentation quality is inconsistent. Plugin ecosystem is thin. Better Auth has superseded it for new projects.

#### Lucia — DEPRECATED

Deprecated March 2025. The Lucia team recommends Better Auth as successor. Not a viable option.

### VERDICT: Better Auth

For a product that will handle customer data and needs long-term independence, owning your auth is non-negotiable. Better Auth provides the right balance: modern features (passkeys, 2FA, org management), zero cost, zero vendor lock-in, and the unique AI agent auth capabilities that are directly relevant. The trade-off is building our own login UI, which is a one-time cost of a few hours.

---

## 6. Email Infrastructure

### Why this matters for us
We need two distinct email capabilities:
1. **Transactional:** Auth emails, notifications, alerts (low volume, high deliverability)
2. **Outbound sequences:** AI-generated sales emails sent on behalf of founders (medium volume, high deliverability, must avoid spam)

### Options Evaluated

#### Resend — 8/10

**Maturity:** Founded 2023. ~3 years of ISP relationship building. Modern DX leader.

**Key features:**
- React Email for templating (build emails like React components)
- Clean, modern API
- Dedicated IPs available as add-on
- Webhook support for delivery events

**Pricing:**
- Free: 3,000 emails/month, 100/day limit
- Pro: $20/mo for 50K emails

**Strengths:** Best DX in the category. React Email templating is excellent for a React/Next.js stack. Modern API design.

**Weaknesses:** Youngest provider. Fewer ISP relationships than Postmark (2-3 years vs 15+). No built-in template engine (you use React Email or roll your own). Dedicated IPs only on higher plans. Deliverability is improving but not yet at Postmark's level.

**Cost at scale:**
- 10 users: Free (well under 3K/mo)
- 100 users: Free or $20/mo
- 1000 users: $20/mo (50K emails likely sufficient)

#### Postmark — 8/10

**Maturity:** 15+ years. Gold standard for transactional email deliverability.

**Key features:**
- Separate message streams for transactional and broadcast (protects deliverability)
- Built-in template engine with Mustachio
- Dedicated IPs at 300K+ emails/month
- Best-in-class deliverability

**Pricing:** $15/mo for 10K emails. $1.80/1K additional.

**Weaknesses:** No React Email integration. More expensive per-email than Resend at higher volumes. Older API design.

#### Amazon SES — 6/10

**Maturity:** AWS-grade reliability.

**Pricing:** $0.10/1K emails. Cheapest at scale by 3-30x.

**Weaknesses:** Terrible DX. No built-in templating worth using. Requires managing bounce handling, complaint handling, dedicated IP warmup manually. Hidden costs (dedicated IPs at $24.95/mo, Virtual Deliverability Manager at $0.07/1K). Not worth the DX tax for a small team.

#### SendGrid — 5/10

**Maturity:** Long-established. Owned by Twilio.

**Critical weakness:** Free plan ended May 2025. Starts at $19.95/mo. Reputation for declining deliverability. DX inferior to Resend.

### VERDICT: Resend (primary) + Amazon SES (high-volume fallback)

Start with Resend for everything. The React Email integration with our Next.js stack is a natural fit. The DX advantage means faster iteration on email templates. The free tier covers the early phase.

**For outbound sequences at scale:** If we hit >50K emails/month on sequences, add Amazon SES as a secondary sender for the bulk outbound (cost drops from ~$0.40/1K to $0.10/1K). Use Resend for transactional (auth, notifications) where deliverability matters most.

---

## 7. Queue / Job System

### Why this matters for us
Background jobs are critical for: company enrichment, contact enrichment, email sequence execution (send email, wait 3 days, check reply, send follow-up), deal scoring, data sync, webhook processing.

### Options Evaluated

#### Inngest — 9/10

**Maturity:** Purpose-built for serverless/Next.js workloads. Event-driven architecture.

**Key features:**
- No queue/worker infrastructure to manage — functions execute on your existing serverless endpoints
- Step functions with sleep, fan-out, debounce, priority queues
- Durable execution: function state persists across serverless cold starts
- Event-driven: send an event, Inngest orchestrates which functions run
- Built-in retry, throttling, concurrency control
- Cron scheduling
- Dashboard for monitoring and debugging

**Pricing:**
- Free: 50,000 runs/month
- Pro: $50/mo (unlimited events, pay per step)

**Why it wins for this project:** Email sequences are inherently step functions: send email -> wait 3 days -> check reply -> branch (follow-up or stop). Inngest's step primitive (`step.sleep("3 days")`) models this directly without managing cron jobs or Redis queues. The 50K free runs cover significant early usage.

**Weakness:** Proprietary cloud service. Cannot self-host the orchestration engine. Vendor dependency.

**Cost at scale:**
- 10 users: Free
- 100 users: Free or $50/mo
- 1000 users: ~$50-200/mo

#### BullMQ + Redis — 8/10

**Maturity:** De facto standard for Node.js job queues. Built on Redis Streams. Used by thousands of companies processing billions of jobs.

**Key features:**
- Delayed jobs, priorities, retries, rate limiting
- Repeatable jobs via cron expressions
- Flow producers for DAG-style job dependencies
- OpenTelemetry support (v5.71+)
- Dead letter queues
- TypeScript native

**Pricing:** Free (open source). Redis hosting cost only (~$0-30/mo on Railway/Upstash).

**Why it is strong:** Zero vendor lock-in. Full control. Proven at massive scale. The mental model is simple: jobs go in, workers process them.

**Weakness:** Requires managing Redis infrastructure. No built-in durable execution for multi-day workflows (you must implement state machines for "wait 3 days then send follow-up"). More operational overhead for a small team.

#### Trigger.dev v3 — 7/10

**Maturity:** Open source (Apache 2.0). Self-hostable.

**Key features:**
- Jobs run on dedicated compute (no serverless timeout limits)
- Unlimited execution time for long-running tasks
- Self-hostable for free with unlimited runs

**Strengths:** Best for long-running compute-intensive tasks (video processing, large data imports). Open source and self-hostable.

**Weakness:** Smaller managed cloud free tier (5,000 runs vs Inngest's 50,000). Less sophisticated step function primitives than Inngest.

### VERDICT: Inngest (primary) + BullMQ (fallback for self-hosted)

Inngest's step function model is a perfect match for email sequences and enrichment pipelines. The serverless execution model means zero infrastructure management. The free tier is generous.

**Risk mitigation:** If Inngest's vendor dependency becomes unacceptable, BullMQ + Redis is a well-understood fallback. The function signatures can be designed to be portable.

---

## 8. Vector Database / RAG Infrastructure

### Why this matters for us
Core feature: "schema-less customer memory" with "natural language queries on pipeline with citations" and "95%+ recall accuracy." We need to store embeddings of every customer interaction and retrieve them with semantic search.

### Options Evaluated

#### pgvector (in Neon PostgreSQL) — 9/10

**Maturity:** PostgreSQL extension. Supports cosine similarity, L2 distance, inner product. HNSW and IVFFlat indexing. pgvectorscale benchmarked 471 QPS vs Qdrant's 41 QPS at 99% recall on 50M vectors.

**Key advantages:**
- Same database as relational data — no separate service to manage
- Transactional consistency: vector updates and relational updates in the same transaction
- Familiar SQL interface for queries
- JOIN vector results with relational data (e.g., "find similar interactions for contacts in deal stage X")
- Neon supports pgvector natively
- For <10M vectors, PostgreSQL + pgvector matches or exceeds dedicated vector databases

**Pricing:** Included in Neon pricing. No additional cost.

**When to move away:** Only if we exceed 10M+ vectors AND need sub-10ms latency at that scale. For our use case (customer interactions for early-stage founders doing founder-led sales), we are talking thousands to low millions of vectors, well within pgvector's sweet spot.

#### Pinecone — 6/10

**Maturity:** Fully managed. Easiest to start with. Zero infrastructure.

**Weakness:** Proprietary, closed-source. Data stored in Pinecone's cloud. Eventually consistent writes. Costs scale quickly at high query volumes. Adds an entire external service for something pgvector handles in our existing database.

#### Qdrant — 7/10

**Maturity:** Open source, written in Rust. Best metadata filtering. Self-hostable.

**Weakness:** Requires running a separate service. pgvectorscale actually outperforms it at high recall targets (471 QPS vs 41 QPS at 99% recall on 50M vectors). Adds operational complexity for no benefit at our scale.

### VERDICT: pgvector in Neon

One database for everything. No additional service. No additional cost. Transactional consistency between vector and relational data. SQL-native queries that can JOIN semantic search results with business data. This is the correct architecture for our scale and use case.

**RAG implementation pattern:**
1. Embed all customer interactions (emails, meetings, calls) using an embedding model
2. Store embeddings in a `vector` column alongside the interaction metadata
3. NL queries: embed the query, use cosine similarity search with metadata filters
4. Citations: the matching rows contain the source interaction, providing automatic citations

---

## 9. Deployment

### Why this matters for us
We need: frontend hosting, backend API, WebSocket support, background job execution, database, and zero-downtime deployments. Prefer minimal DevOps overhead.

### Options Evaluated

#### Vercel (Frontend) + Railway (Backend) — 9/10

**Why split deployment:**
- Vercel is unmatched for Next.js: fastest builds, best preview deployments, native AI SDK integration, edge runtime
- But Vercel cannot run long-lived processes (WebSocket servers, background workers)
- Railway fills this gap perfectly: persistent services, WebSocket support, cron jobs, managed Redis

**Vercel (Next.js frontend + API routes):**
- Free hobby tier, Pro at $20/user/mo
- Native Next.js 16 support with Turbopack
- Preview deployments per PR
- Edge Functions for low-latency AI streaming
- Serverless functions for API routes

**Railway (Backend services + workers):**
- $5/mo + usage (~$0.000463/vCPU-second)
- Persistent processes (no timeout)
- WebSocket support (60s keep-alive)
- Managed Redis (for BullMQ if needed)
- Cron jobs
- One-click database provisioning

**Combined cost at scale:**
- 10 users: ~$5/mo (Vercel free + Railway hobby)
- 100 users: ~$30-50/mo
- 1000 users: ~$70-150/mo

#### Vercel Only — 7/10

**Weakness:** Cannot run persistent WebSocket servers or long-running background jobs. Serverless function timeouts (10s free, 60s Pro, 300s Enterprise). Not suitable for our background enrichment and sequence execution needs.

#### Railway Only — 7/10

**Weakness:** Next.js preview deployments and edge runtime are inferior to Vercel's native support. You lose the Vercel AI SDK's edge optimizations. Build times are slower.

#### Fly.io — 7/10

**Maturity:** Excellent for global edge deployment. 35+ data centers. Container-based.

**Strength:** Lowest latency for global users. Best for apps where every millisecond matters.

**Weakness:** More complex configuration than Railway. Less polished DX. Our users are early-stage founders, likely concentrated in US/EU — global edge deployment is premature optimization.

#### Self-hosted (AWS/GCP/DO) — 5/10

**Weakness:** Massive DevOps overhead for a solo/small team. Premature at this stage. Consider for >10,000 users when cost optimization becomes critical.

### VERDICT: Vercel (frontend) + Railway (backend services)

Vercel for what it does best: Next.js hosting, preview deployments, edge functions, AI streaming. Railway for what Vercel cannot do: persistent WebSocket servers, background workers, managed Redis. This is a common and well-documented architecture in 2026.

---

## 10. AI / LLM Integration Patterns

### Why this matters for us
AI is the core of the product. Every feature involves LLM calls: chat interface, auto-enrichment, email generation, deal coaching, NL queries, signal detection, scoring.

### Vercel AI SDK 6 — 10/10

**This is the obvious and only choice.** No other framework comes close for our stack.

**Key capabilities:**

1. **Streaming chat:** `useChat` hook handles the entire chat lifecycle (messages, streaming, error handling, abort). SSE-based. Works with any LLM provider.

2. **Structured output:** `Output.object()`, `Output.array()`, `Output.choice()`, `Output.json()` — generate typed, validated objects from LLM calls. Essential for enrichment (structured company data), scoring (numeric scores with reasoning), and sequence generation (structured email plans).

3. **Tool calling:** Define tools with Zod schemas. The SDK handles the execution loop automatically: LLM decides to call tool -> SDK executes tool -> result goes back to LLM -> repeat until done. `needsApproval` flag for human-in-the-loop on destructive actions.

4. **Agent abstraction:** `ToolLoopAgent` class for production agent implementations. Type-safe tool composition. Call options for per-request customization.

5. **MCP support:** Stable in v6. OAuth authentication, resource exposure, prompt templates, server-initiated elicitation. Enables our product to expose itself as an MCP server for AI agent interoperability.

6. **Provider-agnostic:** Single API for OpenAI, Anthropic, Google, Mistral, Groq, Together, Fireworks, etc. Switch models with one line change. Mix models within the same application.

7. **DevTools:** `devToolsMiddleware` exposes every step of agent flows — inputs, outputs, token usage, timing. Launch via `npx @ai-sdk/devtools`.

8. **Streaming React Components:** `streamUI` lets the LLM return React components. The model can decide to render a chart, a data table, or a custom widget inline in the chat.

9. **Reranking:** Native `rerank()` function for RAG result reranking via Cohere, Bedrock, or Together.

### LLM Provider Strategy

**Primary: Anthropic Claude (Opus/Sonnet)** — Best reasoning, longest context, best tool use
**Secondary: OpenAI GPT-4o** — Best structured output compliance, fastest for simple tasks
**Embeddings: OpenAI text-embedding-3-small** — Best price/performance for embeddings
**Fast/cheap tasks: Groq (Llama 3)** — Fastest inference for classification, scoring, simple extraction

The AI SDK makes provider switching trivial. Start with Claude for everything, optimize later by routing different task types to optimal models.

---

## 11. Monorepo vs Separate Services

### Why this matters for us
We have: a Next.js frontend, background workers, shared types/validation, shared database models, email templates, and potentially a CLI. How do we organize the code?

### Options Evaluated

#### Turborepo Monorepo — 9/10

**Maturity:** Owned by Vercel. Simple, fast, minimal configuration. Integrates natively with Next.js and Vercel.

**Key features:**
- Remote caching: build artifacts shared across CI and developers
- Task orchestration: parallel execution with dependency awareness
- Incremental builds: only rebuild what changed
- Simple config: `turbo.json` is ~20 lines to start
- Native Vercel integration for deployment

**Recommended structure:**
```
apps/
  web/          — Next.js frontend + API routes
  worker/       — Background job processors (Inngest functions)
packages/
  db/           — Drizzle ORM schema, migrations, queries
  ai/           — AI SDK wrappers, prompts, tool definitions
  email/        — React Email templates
  shared/       — Types, validation schemas (Zod), constants
  auth/         — Better Auth configuration
```

**Why monorepo wins:**
- Shared TypeScript types between frontend and workers (zero drift)
- Single Zod schema validates both API inputs and LLM structured outputs
- Database models shared across all services
- AI tool definitions shared between chat and background enrichment
- One `pnpm install`, one git repo, one CI pipeline

**Cost at scale:** Free (open source). Vercel remote caching free for Pro tier.

#### Nx — 7/10

**Maturity:** More feature-rich than Turborepo. Better for large teams (5+ teams in same repo).

**Weakness:** Steeper learning curve. More configuration. Overkill for a solo/small team. The additional features (module boundary enforcement, code generation, distributed task execution) solve problems we don't have yet.

#### Separate Repos — 4/10

**Weakness:** Type drift between services. Dependency version conflicts. Multiple CI pipelines. Shared code requires publishing packages. Dramatically slower development velocity for a small team.

### VERDICT: Turborepo Monorepo

Simple, fast, Vercel-native. Start with Turborepo, shared packages for types/db/ai, and separate apps for web and workers. If we outgrow it, Nx migration is straightforward.

---

## 12. Final Stack Recommendation

| Layer | Choice | Score | Monthly Cost (10/100/1K users) |
|-------|--------|-------|-------------------------------|
| **Frontend** | Next.js 16 (App Router) | 9/10 | $0 / $20 / $70 |
| **Runtime** | Bun | 8/10 | (included in hosting) |
| **Database** | Neon (PostgreSQL) | 9/10 | $0 / $19 / $69 |
| **Vector DB** | pgvector (in Neon) | 9/10 | $0 (included) |
| **Real-time** | SSE (AI SDK) + Bun WebSocket | 9/10 | $0 (included) |
| **Auth** | Better Auth | 9/10 | $0 / $0 / $0 |
| **Email** | Resend (+SES at scale) | 8/10 | $0 / $0 / $20 |
| **Jobs/Queue** | Inngest | 9/10 | $0 / $0 / $50 |
| **AI SDK** | Vercel AI SDK 6 | 10/10 | $0 (LLM costs separate) |
| **Deployment** | Vercel + Railway | 9/10 | $5 / $30 / $70 |
| **Monorepo** | Turborepo | 9/10 | $0 |
| **ORM** | Drizzle ORM | — | $0 |
| **Validation** | Zod | — | $0 |

### Total Infrastructure Cost (excluding LLM API costs)

| Scale | Monthly Cost |
|-------|-------------|
| 10 users | ~$5-10 |
| 100 users | ~$70-100 |
| 1,000 users | ~$280-400 |

### Key Design Principles

1. **One database for everything.** PostgreSQL (Neon) handles relational data AND vector embeddings. No service sprawl.
2. **Full-stack TypeScript.** One language, shared types, shared validation, from UI to database to AI tools.
3. **Streaming-first.** SSE for AI, WebSocket for real-time — both native to the stack.
4. **Zero vendor lock-in on core.** Auth (Better Auth), database (PostgreSQL), and business logic are fully portable. Vendor dependency only on commodity services (hosting, email delivery).
5. **Progressive complexity.** Start with fewer services, add dedicated vector DB / separate backend / etc. only when scale demands it.

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Bun compatibility issue | Code is TypeScript — swap to Node.js 22 with zero code changes |
| Inngest vendor lock-in | Function signatures designed for portability. BullMQ + Redis fallback documented. |
| Neon outage | PostgreSQL-compatible — can migrate to any Postgres host. Daily backups + point-in-time recovery. |
| Vercel cost spike | Next.js is deployable to Railway, Fly.io, or self-hosted. Not locked in. |
| pgvector scale limit | At >10M vectors, add Qdrant. But this is a >$10K MRR problem. |

---

## Appendix: Technology Version Reference

| Technology | Version (March 2026) |
|------------|---------------------|
| Next.js | 16.2 |
| React | 19.2 |
| Bun | 1.2+ |
| Node.js (fallback) | 22 LTS |
| Vercel AI SDK | 6.x |
| Neon PostgreSQL | 17 |
| pgvector | 0.8+ |
| Better Auth | Latest stable |
| Resend | Latest API |
| Inngest | Latest SDK |
| Turborepo | 2.x |
| Drizzle ORM | Latest stable |
| Zod | 4.x |
