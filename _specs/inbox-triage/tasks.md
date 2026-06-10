# INBOX-TRIAGE — Tasks

Each task: implement → verify → test. Run vitest/tsc from `app/apps/web` (repo-root vitest is a trap).

- [ ] **T1 — Schema + migration**: `inboxTriage` table in `db/schema/outbound.ts` + `drizzle/0071_inbox_triage.sql`. Verify: tsc. Test: none (DDL).
- [ ] **T2 — Pure assembly lib**: `lib/inbox/conversations.ts` — grouping (threadId/contact/email fallback), lanes, reopen rule, snooze expiry, priority buckets, reason templates, snippet. Test: `__tests__/inbox-conversations.test.ts` covering every lane rule, reopen-on-new-inbound, ordering, fallback keys, handled detection (ooo/unsub/bounce).
- [ ] **T3 — List API**: `GET /api/inbox/conversations` (rows → lib → lane page + counts). Verify: curl against dev with real tenant data.
- [ ] **T4 — Detail API**: `GET /api/inbox/conversations/detail?key=` (messages, intelligence validation, enrollment, preparedDraft, contact). Verify: curl.
- [ ] **T5 — Triage API**: `POST /api/inbox/triage` upsert state machine + `POST /api/inbox/drafts/[id]/consume`. Test: route-level tests with mocked db (existing pattern in `__tests__/*-api.test.ts`).
- [ ] **T6 — processReply persists classification** (R8): pass outboundEmailId through, update `reply_classification`. Test: extend existing functions test if mockable quickly; else verified by code review + tsc (event already carries the id).
- [ ] **T7 — UI master-detail**: rewrite `inbox/page.tsx` + `_conversation-list.tsx` + `_conversation-pane.tsx`; extract old table to `_outbound-table.tsx` with pagination; lanes via FilterBar; composer + CallActions wiring; prepared-draft card; intelligence section; keyboard j/k/e/r.
- [ ] **T8 — Apply migration** to dev DB (apply-migrations.ts or psql) and to prod before merge.
- [ ] **T9 — Quality gates**: `npx tsc --noEmit`, `npx vitest run`, then live Playwright walkthrough on dev (lanes, read, done/reopen, snooze, reply draft, outbound tab) with screenshots.
