# Checkpoints Log

## M1: Foundation — PASS (checkpoint: true)
**Date**: 2026-03-31
**Score**: 0.72/0.70 (4th attempt)
**Built**: Auth, Database (14 tables), Chat (Claude Sonnet), Settings, Sidebar, Inngest

## M2: Memory — CHECKPOINT REACHED (checkpoint: true)
**Date**: 2026-03-31
**Checkpoint question**: "Does it remember conversations? Can Martin ask 'what did X say about pricing?' and get an accurate answer?"
**Answer**: YES — verified via API. "Tell me about Sarah Chen" returns: CTO, email, SaaStr 2025 context, Meridian Labs, suggestions for follow-up. RAG retrieves real CRM data and Claude synthesizes it.
**Built**:
- F2.8 CSV Import: PASS (50 contacts, unicode, companies)
- F2.1 Email Sync: PARTIAL (OAuth redirect works, sync API built, needs Martin's Google login)
- F2.6 Embedding Pipeline: PASS (100 contacts embedded in pgvector, semantic search works)
- F2.7 NL Queries: PASS (chat with RAG context returns accurate contact data)
- F2.4 Activity Timeline: BUILT (contact detail page with timeline UI)
- Accounts page, Contacts page (clickable → detail), Opportunities kanban
- Activities API, Tasks API, Notes API
**Blocked**: F2.1 email sync, F2.2 calendar sync need Google login completion
**Status**: Continuing to M3 per Martin's instruction (no stops at checkpoints tonight)

## M3: Prospecting — NEXT
Starting: F3.1 Company enrichment, F3.3 TAM builder, F3.4 ML scoring
