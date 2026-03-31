# Stack Decision

Every technical decision with evidence and completeness score.

---

## Frontend: Next.js 16 (App Router) — 9/10

**Why**: Chat-first product needs streaming RSC, Vercel AI SDK 6 (`useChat`, `useCompletion`, `streamUI`), largest ecosystem. Turbopack stable. Agent-ready tooling. Both Monaco and Lightfield use Next.js.
**Alternative rejected**: SvelteKit (7/10) — less AI SDK support, smaller ecosystem. Remix (6/10) — wrong paradigm for chat.
**Missing**: Nothing material.

## Backend: Next.js API Routes + Separate Worker Service — 8/10

**Why**: API routes for request/response. Separate Node.js worker process for long-running jobs (sequence execution, enrichment, email monitoring). Keeps architecture simple for a solo/small team.
**Alternative rejected**: Go microservices (overkill), Python (FastAPI — less integrated with frontend).
**Missing**: May need to split to dedicated services at 500+ customers.

## Database: PostgreSQL on Neon — 9/10

**Why**: Neon offers serverless Postgres with branching (great for dev), generous free tier, autoscaling, and native pgvector support. Row-level security for multi-tenancy. JSONB for schema-less properties (like Lightfield's approach).
**Alternative rejected**: Supabase (8/10, more batteries but vendor lock-in), PlanetScale (8/10, MySQL not Postgres, no pgvector), Turso (7/10, SQLite — too experimental).
**Cost**: Free up to 0.5 GB, $19/mo for 10 GB, scales well.

## Vector Database: pgvector (integrated with PostgreSQL) — 8/10

**Why**: No separate service to manage. HNSW indexes in pgvector 0.7+ are production-quality. Keeps all data in one place (RLS applies to vectors too). Good enough for our scale (millions of embeddings, not billions).
**Alternative rejected**: Pinecone (9/10 quality but $70+/mo and separate service), Qdrant (8/10 but separate infra), Weaviate (7/10 complex).
**Missing**: At very high scale (>100M vectors), may need dedicated vector DB. Fine for years.

## Embedding Model: OpenAI text-embedding-3-small — 9/10

**Why**: $0.02/1M tokens, 1536 dimensions, excellent quality/cost ratio. Best tested embedding model for RAG retrieval. Can upgrade to text-embedding-3-large ($0.13/1M) if quality needs increase.
**Alternative rejected**: Cohere embed-v4 (comparable, more expensive), local models (ONNX — operational complexity).

## LLM Strategy: Multi-model — 9/10

| Task | Model | Why |
|------|-------|-----|
| Cold email writing | Claude Sonnet 4.6 | Best natural prose, avoids "AI slop" |
| Deal coaching / analysis | Claude Sonnet 4.6 | Complex reasoning with context |
| NL pipeline queries | Claude Haiku 4.5 | Fast, cheap, good enough for structured queries |
| Classification / routing | GPT-4.1 Nano | $0.10/1M input, fastest, reliable structured output |
| Meeting summarization | Claude Sonnet 4.6 | Long context, good extraction |
| Account enrichment | GPT-4.1 Mini | Cost-effective for structured extraction from web |

**Why multi-model**: Each task has different cost/quality/speed tradeoffs. Using one model for everything wastes money or sacrifices quality. Route by task type.
**Cost estimate**: ~$0.03-0.10 per user per day at typical usage.

## Authentication: Clerk — 8/10

**Why**: Best DX for Next.js. Prebuilt components (sign-in, sign-up, user management). B2B features (organizations, roles). OAuth providers (Google, Microsoft — needed for email sync). Generous free tier (10K MAU). Webhook support.
**Alternative rejected**: Auth.js (7/10, more DIY), Stytch (7/10, Lightfield uses it but more complex), Lucia (6/10, deprecated).

## Email Infrastructure: Dual-stack — 9/10

**Transactional**: Resend ($0.30/1K emails after free 100/day) — best DX, React email templates.
**Cold outbound**: Amazon SES ($0.10/1K) via custom SMTP with per-user mailbox rotation. Separate domain/IP from transactional.
**Why split**: Mixing transactional and cold outbound on same infrastructure kills deliverability for both.

## Queue / Job System: BullMQ on Redis — 8/10

**Why**: Mature, well-tested with Node.js. Handles: sequence step execution, enrichment jobs, email sending, webhook processing, meeting transcription. Redis on Upstash (serverless) or Railway.
**Alternative rejected**: Inngest (8/10 for serverless, but less control), pg-boss (7/10, Postgres-based — simpler but less capable).

## Real-time: Server-Sent Events (SSE) — 8/10

**Why**: LLM streaming already uses SSE. Vercel AI SDK built on it. Simpler than WebSockets for our use case (server→client updates). Can add WebSocket upgrade later if needed for collaborative features.

## Deployment: Vercel (frontend) + Railway (workers) — 8/10

**Why**: Vercel is the natural home for Next.js (best performance, edge functions, streaming). Railway for long-running worker processes ($5/mo base + usage). Keeps costs low while scaling.
**Alternative rejected**: Fly.io (8/10, more control but more ops), self-hosted (too much ops burden for small team).

## Monorepo: Turborepo — 8/10

```
apps/
  web/          — Next.js app (Vercel)
  worker/       — BullMQ worker (Railway)
packages/
  db/           — Drizzle schema + migrations
  ai/           — LLM client wrappers
  email/        — Resend + SES integration
  shared/       — Types, utils, constants
```

---

## Total Infrastructure Cost Estimate

| Scale | Monthly Cost |
|-------|-------------|
| 10 users | ~$50/mo (free tiers cover most) |
| 100 users | ~$200-400/mo |
| 1000 users | ~$2,000-5,000/mo |

Not including LLM API costs ($0.03-0.10/user/day) or data provider costs.

---

## Completeness: 9/10

What's covered: Every layer from frontend to deployment, with evidence-based choices.
What's missing: Monitoring/observability stack (can add Sentry + Axiom later), CDN for assets (Vercel handles this), CI/CD pipeline (GitHub Actions, straightforward).
