# Category 4: Performance & Scalability Audit

Audited: 2026-04-01
Auditor: CODE session (no Playwright)

---

## Summary: 3 ✅ / 9 🟡 / 5 ❌

Note: Many items require running the live app or load testing tools (Playwright, k6, etc). Items marked 🟡 could not be fully verified without a running server.

---

### 4.1 Page load time < 2 seconds
**🟡 CANNOT TEST** — Requires Playwright or Lighthouse. Next.js 15 with Turbopack should be fast, but no measurement exists.

---

### 4.2 Chat response streaming starts < 1 second
**🟡 PARTIAL** — AI SDK `streamText()` begins streaming as soon as the model starts generating. Depends on Claude/OpenAI API latency. `maxDuration = 30` set in chat route.

---

### 4.3 NL query response < 5 seconds
**🟡 CANNOT TEST** — Depends on embedding search + LLM response time. pgvector cosine distance query should be fast, LLM adds 1-3s.

---

### 4.4 Contact list loads with 1,000+ contacts
**❌** — Contact list is hardcoded to `LIMIT 200` with no pagination.

**Evidence:** `contacts/route.ts:12`:
```typescript
const result = await db.select().from(contacts).limit(200);
```
No `offset`, no cursor pagination, no virtual scroll. At 1000+ contacts, 800 are invisible.

---

### 4.5 Account list loads with 500+ accounts
**❌** — Account list is hardcoded to `LIMIT 50`.

**Evidence:** `accounts/route.ts:14-16`:
```typescript
const accounts = await db.select().from(companies).limit(50);
```

---

### 4.6 Pipeline kanban loads with 100+ deals
**🟡 CANNOT TEST** — Requires UI testing. API returns deals but no pagination visible.

---

### 4.7 CSV import handles 10,000 rows
**🟡 PARTIAL** — Import route accepts up to 10,000 rows (has explicit check). But no file size limit means a 500MB CSV would OOM before row count is checked.

---

### 4.8 DB queries optimized (no N+1, proper indexes)
**🟡 PARTIAL**

**Indexes:** Schema has good index coverage:
- `contacts_tenant_id_idx`, `contacts_company_id_idx`, `contacts_email_idx`
- `companies_tenant_id_idx`, `companies_domain_idx`
- `deals_tenant_id_idx`, `deals_company_id_idx`, `deals_stage_idx`
- `activities_tenant_id_idx`, `activities_entity_idx`, `activities_occurred_at_idx`
- Plus indexes on sequences, enrollments, mailboxes, outbound emails

**N+1 issue:** `search/tam/route.ts` hydrates each search result with individual DB queries:
```typescript
const hydrated = await Promise.all(
  filtered.map(async (result) => {
    // Individual DB lookup per result — N+1
  })
);
```

---

### 4.9 Embedding search (pgvector) returns < 2 seconds
**🟡 CANNOT TEST** — pgvector `<=>` operator used for cosine distance. No HNSW or IVFFlat index visible in migrations. Performance at scale depends on index type.

**Risk:** Without a vector index, search is sequential scan. At 10K+ embeddings, this will be slow.

---

### 4.10 No memory leaks on long sessions
**🟡 CANNOT TEST** — Requires long-running browser session monitoring.

---

### 4.11 API endpoints respond < 500ms for CRUD
**🟡 CANNOT TEST** — Requires running server + timing. CRUD routes are simple Drizzle queries, should be fast.

---

### 4.12 Concurrent users (5 simultaneous)
**🟡 CANNOT TEST** — Requires load testing tool.

---

### 4.13 pgvector at 10K/50K/100K embeddings
**❌ NOT TESTED** — No benchmarks exist. No vector index configured (HNSW/IVFFlat).

---

### 4.14 Contact list at 100/1K/10K/50K
**❌ NOT TESTED** — Hardcoded LIMIT 200, no pagination. Will fail at scale.

---

### 4.15 Embedding storage calculation
**❌ NOT DOCUMENTED** — `text-embedding-3-small` produces 1536-dim vectors. At 4 bytes/float = 6KB per embedding. 100 clients x 5000 contacts = 500K embeddings = ~3GB. Supabase Pro supports this but not documented.

---

### 4.16 Connection pooling
**✅** — Using Supabase connection pooler (port 6543, transaction mode). Database URL confirms pooler: `aws-1-eu-central-1.pooler.supabase.com:6543`.

**Note:** Two separate postgres connections created:
1. `db/index.ts` — Drizzle ORM connection
2. `lib/embeddings.ts` — Direct postgres-js connection for vector operations

Both use the pooler URL, which is correct.

---

### 4.17 CDN for static assets
**✅** — Next.js on Vercel automatically serves static assets via CDN. `_next/static/` assets are cached and served from edge.

---

### 4.18 Image optimization
**✅** — Next.js `next/image` handles optimization. No custom image upload feature exists yet.
