# Harness Health

| Sprint | Feature | Attempt | Result | Score | Notes |
|--------|---------|---------|--------|-------|-------|
| 1 | M1 Foundation | 1 | FAIL | 0.52 | Fake eval, no screenshots |
| 1 | M1 Foundation | 2 | FAIL | 0.65 | Real eval, chat broken |
| 1 | M1 Foundation | 3 | FAIL | 0.72 | Code quality 0.65 |
| 1 | M1 Foundation | 4 | PASS | 0.72 | All dims pass |
| 2 | F2.1 Email Sync | 1 | PARTIAL | — | OAuth flow works, sync needs manual Google login |
| 2 | F2.6 RAG Pipeline | 1 | PASS | — | 100 contacts embedded, semantic search + chat RAG verified |
| 2 | F2.8 CSV Import | 1 | PASS | — | 50 contacts, unicode, companies auto-created |

**Pass rate**: 3/5 features pass on first attempt (60%)
**Health**: Improving — proper specs, feature branches used for F2.1 and F2.6
**Date**: 2026-03-31

## Working features
- Auth: email/password + Google OAuth (consent screen verified)
- Chat: Real Claude Sonnet responses with RAG context from CRM data
- RAG: 100 contacts embedded, semantic search works ("CTOs in AI" → relevant results)
- CSV Import: 50 contacts + companies with full unicode support
- Accounts/Contacts/Opportunities pages with CRUD APIs
- Settings with Gmail connection UI + knowledge base
- Pipeline kanban (8 stages)
- 14 database tables in Supabase with pgvector

## Key moment
Chat query "Tell me about Sarah Chen" → Claude correctly returns her title (CTO), email, SaaStr context, Meridian Labs, and suggests next steps. This is the "customer memory" working.
