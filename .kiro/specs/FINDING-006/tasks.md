# FINDING-006: Tasks

## Task 1: Create cache helper utility (~30min)
- Create `app/apps/web/src/lib/llm-cache.ts` with `withCacheControl()` helper
- Helper accepts system text + provider flag, returns annotated message object for Anthropic or plain string for others
- Export `isAnthropicConfigured()` predicate
- **Verify:** Unit test — returns cacheControl when Anthropic, plain string otherwise

## Task 2: Patch deal-briefing and Inngest functions (~1h)
- Update `lib/deal-briefing.ts` to wrap the system prompt with cacheControl
- Update `inngest/memory-auto-extract.ts` to wrap the system prompt with cacheControl
- **Verify:** Run existing `deal-briefing.test.ts`; confirm no regressions

## Task 3: Patch remaining API routes (~1h)
- Update `api/voice-of-customer/route.ts` system messages
- Update `api/meetings/prep/route.ts` system messages
- Update `api/import/smart/route.ts` and `api/import/smart/preview/route.ts`
- Update `api/eval/route.ts` and `api/eval/run-all/route.ts`
- **Verify:** `npm run build` passes; grep confirms no Anthropic `generateObject`/`generateText` calls without cacheControl

## Task 4: Add grep-based lint check (~30min)
- Add a script or test that greps for Anthropic LLM calls missing cacheControl
- Prevents future regressions when new endpoints are added
- **Verify:** Script passes on patched codebase, fails if cacheControl is removed from one endpoint
