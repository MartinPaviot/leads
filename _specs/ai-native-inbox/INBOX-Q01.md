# INBOX-Q01 — Natural-language semantic search
> Theme: T5 · Autonomy rung: helper · Priority: P0
> Pillar: P2 reading / P5 GTM moat

## User story
As a user with a full mailbox, I want to type a question in plain language ("emails about
the pricing objection from last week", "the intro from the Geneva foundation") and get the
right threads ranked by meaning — not just literal keyword matches — so I can find mail the
way I think about it, not the way I filed it.

## Why (audit anchor)
Shortwave's thesis is "AI is the inbox" — semantic search over all mail is the baseline; its
search understands intent, not just substrings (audit §3). Superhuman's `/` search is fast but
operator/keyword-based. Our inbox today has **no search box at all** — `/inbox` only reads a
`?conversation=` URL param (`inbox/page.tsx:70`). We already own the retrieval engine (pgvector
+ BM25 + RRF over an `embeddings` table, `lib/ai/embeddings.ts`), so a meaning-first inbox
search is a thread away — and it lands grounded in our own data with citations, which is the bar.

## Requirements (EARS)
- WHEN the user submits a natural-language query in the inbox search field, the system SHALL
  return conversations ranked by semantic relevance using hybrid retrieval (vector + full-text),
  not substring match alone.
- The system SHALL scope every result to the viewer's own mailbox and tenant
  (`getInboxScope` + `scopeConversationRows`, `lib/inbox/user-scope.ts`) before display.
- The system SHALL search both inbound email activities and the user's outbound emails, and
  collapse hits to their parent conversation (`conversationKeyFor`, `lib/inbox/conversations.ts`).
- The system SHALL return results within a perceived-instant budget (skeleton < 100 ms, results
  typically < 800 ms) and SHALL degrade to full-text-only when the embedding provider is absent.
- WHEN a query contains a structured fragment the system also recognizes (a name, an email, a
  date phrase), the system SHALL blend structured filters with the semantic ranking (defer the
  explicit operator grammar to INBOX-Q04).
- The system SHALL show, per result, the matched snippet with the query terms/▸meaning context
  highlighted and a relevance indicator, so the user sees *why* it matched.
- The system SHALL never surface a provider name as the source of a result ("via Elevay").
- WHEN no result clears the relevance floor, the system SHALL say so plainly and offer to widen
  the search (drop the floor / search all folders), never invent a result.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread whose body says "your quote is too expensive" WHEN the user searches "pricing
  pushback" THEN that thread ranks in the top results even though none of those words appear.
- GIVEN two users in the same tenant WHEN user B searches THEN no thread from user A's mailbox
  appears (scope enforced before ranking).
- GIVEN a query "emails from infomaniak last month" WHEN submitted THEN sender + recency narrow
  the candidate set and semantic rank orders within it.
- GIVEN the OpenAI key is unset WHEN the user searches THEN results still return via full-text
  (BM25) ranking and a quiet note explains semantic ranking is unavailable.
- GIVEN a query that matches nothing above the floor WHEN submitted THEN the empty state offers
  "Search everything / loosen match", and shows zero fabricated rows.
- GIVEN a result WHEN shown THEN its snippet highlights the relevant passage and a relevance dot
  reflects the fused score; clicking opens the thread in the reading pane.
- GIVEN a 5,000-thread mailbox WHEN searching THEN the first results paint under ~800 ms (HNSW
  ef_search default is sufficient < 100K rows, `embeddings.ts:64`).

## Edge cases & failure handling
- Embeddings not yet built for recent mail (ingestion lag) → fall back to full-text for the gap;
  show results, never an empty pane; (capture should embed inbound — see Current-state notes).
- Very short query (1–2 chars) → require ≥ 3 chars or treat as a quick filter, don't embed noise.
- Non-English / mixed-language mail → `text-embedding-3-small` is multilingual; full-text uses
  the `english` config (`embeddings.ts:179`) so accents may under-match — semantic path covers it.
- Query is actually an operator string (`from:` …) → hand off to INBOX-Q04's parser.
- Result entity soft-deleted between index and render → filter `deleted_at IS NULL`, drop silently.
- Provider/network flap mid-search → return partial (whichever of vector/full-text resolved),
  mark the search "partial", offer retry.
- Multi-tenant: hard scope; the `embeddings` query already filters `tenant_id` (`embeddings.ts:86`),
  but mailbox scope (`metadata.to ∩ user addresses`) must be applied on top.

## Best-in-class bar
- Hybrid **vector + BM25 fused with RRF** (`searchHybrid`, `embeddings.ts:236`) beats Superhuman's
  keyword search and matches Shortwave's semantic recall — and it's the *same* index that powers
  our CRM answers, so inbox search and "ask about this deal" share one brain.
- Every result is **mailbox-scoped and explainable** (highlighted snippet + relevance), and search
  is one hop from **Ask-AI over the result set** (INBOX-Q02) — find → ask, without leaving the pane.

## Design sketch
- **Data:** `embeddings(tenant_id, entity_type, entity_id, content, embedding vector, search_vector)`
  with HNSW + GIN (`lib/ai/embeddings.ts`). Inbound mail lives in `activities` (channel `email`,
  `activity_type='email_received'`); outbound in `outbound_emails`. Inbound must be embedded as
  `entity_type='activity'` (the `/api/embed activities` scope already does this, `api/embed/route.ts:187`).
- **API:** new `GET /api/inbox/search?q=…&mailbox=…` → `searchHybrid(q, 40, tenantId)` filtered to
  `entity_type='activity'` email rows + outbound, then `scopeConversationRows` + collapse to
  conversations via `buildConversations`. Reuse `searchEmailsByMetadata`/`semanticSearchEmails`
  shapes from `lib/chat/tools/query.ts:388,763`. Returns `[{ conversationKey, snippet, score,
  matchedMessageId }]`.
- **UI:** a search field in `app/(dashboard)/inbox/page.tsx` header (filter-bar 40px row), light
  surface `--color-bg-card`, border `--color-border-default`, focus ring `--color-border-focus`,
  `lucide-react` `Search` icon, placeholder "Search your mail…", shortcut `/` to focus (matches
  Superhuman) + `Esc` to clear; results reuse `_conversation-list.tsx` rows with a highlighted
  snippet and a relevance dot (`--color-accent`); light+dark via tokens, no emoji, no provider
  name, cited.
- **AI:** retrieval only (no generation in Q01); `embedText` for the query vector. The answer/ask
  layer is INBOX-Q02. Relevance = fused RRF score, surfaced as a 3-step dot, never a fake %.
- **Security/perf:** tenant scope in SQL + mailbox scope in app layer; query never interpolated
  raw (parameterized `postgres` template, `embeddings.ts`); cap candidate pool at 40, paginate.

## Tasks (ordered, each with a verify step + test to write)
1. Ensure inbound email activities are embedded at capture/sync (not only on manual `/api/embed`)
   — add embed-on-capture in `email-capture.ts` recordCapturedActivity path. (verify: a freshly
   captured inbound row appears in `embeddings`) (test: `inbox-search-index.test.ts`)
2. `GET /api/inbox/search` — `searchHybrid` → filter to email activities + outbound → scope →
   collapse to conversations. (verify: returns scoped conversation hits) (test: `inbox-search-api.test.ts`
   incl. cross-tenant isolation + OpenAI-absent full-text fallback)
3. Search field + `/`-to-focus in the inbox header; wire to the route; skeleton + empty state.
   (verify: typing "pricing pushback" surfaces the semantically-matched thread in the live app)
   (test: component test for field + highlight render)
4. Snippet highlighting + relevance dot in the result row. (verify: snippet shows the matched
   passage) (test: highlight unit test)
5. Partial/degraded handling (one retrieval path down → partial badge + retry). (verify: kill the
   vector path locally → full-text results still render)

## Current-state notes (VERIFY before building — code moves)
- No inbox search UI exists: `inbox/page.tsx:70` only reads `?conversation=` from the URL.
- Retrieval engine exists and is production-grade: `searchSimilar` (`embeddings.ts:64`),
  `searchHybrid` RRF (`embeddings.ts:236`), HNSW index. Reuse, don't rebuild.
- `/api/embed` embeds contacts/companies/deals/activities (`api/embed/route.ts:187`) but embedding
  is **manual/bulk** — inbound mail is not embedded on capture, so recent mail may be missing from
  the index until step 1 lands. VERIFY whether `inngest/sync-functions.ts` already embeds on sync.
- `lib/chat/tools/query.ts` already has `semanticSearchEmails`, `searchEmailsByMetadata`,
  `getEmailContent` — the API should reuse these shapes/links (`_sourceLink`) for consistency.
- Tenant scoping is in the SQL; **mailbox** scoping (`inboundBelongsToUser`, `user-scope.ts`) must
  be layered on top — the `embeddings` table has no `user_id`/`mailbox_id`, so filter post-fetch.
