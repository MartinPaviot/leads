# Company Brain — tasks

## Phase 1 — read API (this commit)

- [x] Add `lib/company-brain/types.ts` with `CompanyBrain`,
      `GetCompanyBrainOpts`, per-layer types.
- [x] Add `lib/company-brain/freshness.ts` pure helper +
      unit tests (5 cases).
- [x] Add `lib/company-brain/get-brain.ts` :
      single function, parallel `Promise.all` for 6 layers,
      additional queries for transcript-chunk counts +
      stall predictions, multi-tenant guard, capping +
      truncation flags, dossier=null Phase 1.
- [x] Add `lib/company-brain/__tests__/get-brain.test.ts`
      with 7 cases : multi-tenant filter, missing tenantId
      throws, missing companyId throws, empty layers happy
      path, meetings derived from activities, truncation
      flag flip, deal property metadata coercion (new vs
      legacy bare values).
- [x] Add `app/api/brain/[companyId]/route.ts` GET handler
      with admin-or-tenant scoped access, query params for
      caps, 404 on cross-tenant, 401 unauth.
- [x] Verify : `npx tsc --noEmit` 0 errors, `npx vitest
      run` 210 files / 2611 tests pass / 1 skip.
- [x] Verify : `dossier-builder` not modified, no
      schema/migration, no Inngest worker added.

## Phase 2 — materialised cache (NOT in this commit)

Triggered when : Phase 1 read latency > 200ms p95 OR chat
panel calls `getCompanyBrain` per message and observed cost
dominates.

- [ ] New migration `0051_entity_brain_snapshots.sql` :
      table with `(tenant_id, entity_type, entity_id)`
      unique key + jsonb brain payload + TTL.
- [ ] New Inngest worker `materialiseEntityBrain`
      triggered by `brain/refresh-requested` event.
- [ ] Update `getCompanyBrain` to check cache first +
      fall back to live aggregation when stale.
- [ ] Cache-invalidation hooks on key write paths
      (deal property write, signal extracted, transcript
      indexed).

## Phase 3 — surfaces (NOT in this commit)

- [ ] Brain page UI at `/accounts/[id]/brain` consuming
      the read API : 5 collapsible blocks (deals state,
      activities, signals, dossier, transcript citations).
- [ ] Chat tool `getCompanyBrainTool` registered in the
      chat tool registry. When the LLM detects "tell me
      about X" / "what do we know about X", it calls the
      tool instead of composing ad-hoc context.
- [ ] Meeting prep auto-briefing trigger consumes the
      brain instead of separate dossier+activity+signals
      composition.

## Status (2026-05-09)

- Phase 1 : **DONE** (this commit)
- Phase 2 : open, not blocking — wait for measured latency
  pressure before committing.
- Phase 3 : open — Phase 1's API is consumable from any
  chat tool / page route, so adoption can start ad-hoc
  before Phase 3's structured rollout.
