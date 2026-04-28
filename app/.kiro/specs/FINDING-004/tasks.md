# FINDING-004 -- Tasks: EU Region Pinning

All tasks are eval-first: write the test/assertion before the implementation.

---

## Task 1: Create region config module with EU assertions
**Estimate:** 1.5h
**Eval:** Unit test `region-config.test.ts` -- asserts that:
- `assertDatabaseRegion` passes for `*.eu-central-1.aws.neon.tech` URLs
- `assertDatabaseRegion` throws for `*.us-east-1.aws.neon.tech` URLs
- `getAnthropicBaseUrl()` returns `https://eu.anthropic.com` by default
- `isEuEndpoint()` correctly classifies known EU and US hostnames
- `validateAllEndpoints()` returns failures for non-EU configured services

**Implementation:**
1. Create `apps/web/src/lib/region-config.ts`
2. Export `assertDatabaseRegion(url: string)` -- parses hostname, checks for eu-central or eu-west region slug
3. Export `getAnthropicBaseUrl()` -- reads `ANTHROPIC_BASE_URL` env, validates it is an EU endpoint, defaults to `https://eu.anthropic.com`
4. Export `isEuEndpoint(url: string)` -- returns true if hostname resolves to known EU regions
5. Export `validateAllEndpoints()` -- checks DATABASE_URL, ANTHROPIC_BASE_URL, REDIS_URL against EU region list
6. Write the test file at `apps/web/src/__tests__/region-config.test.ts`

**Verify:** `pnpm vitest run region-config`

---

## Task 2: Create centralized Anthropic EU client factory
**Estimate:** 1h
**Eval:** Unit test `anthropic-eu.test.ts` -- asserts that:
- `getAnthropicClient()` creates a client with EU base URL
- Client rejects non-EU base URLs at creation time
- Factory returns consistent singleton across calls

**Implementation:**
1. Create `apps/web/src/lib/llm/anthropic-eu.ts`
2. Import `createAnthropic` from `@ai-sdk/anthropic`
3. Use `getAnthropicBaseUrl()` from region-config
4. Export `getAnthropicClient()` and model helper `getAnthropicModel(modelId: string)`
5. Write test at `apps/web/src/__tests__/anthropic-eu.test.ts`

**Verify:** `pnpm vitest run anthropic-eu`

---

## Task 3: Migrate all Anthropic imports to EU client factory
**Estimate:** 2h
**Eval:** Grep-based assertion script that:
- Zero files import `{ anthropic } from "@ai-sdk/anthropic"` directly
- All files importing anthropic use `getAnthropicModel` from `@/lib/llm/anthropic-eu`
- Existing tests that mock `@ai-sdk/anthropic` are updated to mock the factory

**Implementation:**
1. Search all files importing from `@ai-sdk/anthropic` (83+ files identified)
2. Replace direct `anthropic()` calls with `getAnthropicModel(modelId)`
3. Update `pickModel()` functions in `chat/tools/action.ts`, `chat/ai-attributes.ts`
4. Update `getModel()` in `evals/flywheel.ts`
5. Update all inngest functions: `functions.ts`, `autonomous-pipeline.ts`, `reply-handler.ts`, `founder-coach.ts`, `sync-functions.ts`, `research-agent.ts`, `signal-to-deal-alert.ts`, `ai-autofill.ts`, `meeting-functions.ts`
6. Update `eval-runner.ts` gradeWithLLM function
7. Update test mocks in `enrich-api.test.ts`, `enrich-contacts-api.test.ts`, `emails-api.test.ts`, `deals-api.test.ts`

**Verify:** `grep -r "from \"@ai-sdk/anthropic\"" apps/web/src --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l` must return 0 (excluding test mocks). Full test suite passes.

---

## Task 4: Add startup health-check for region compliance
**Estimate:** 1h
**Eval:** Integration test `region-health.test.ts` -- asserts that:
- Health check passes when DATABASE_URL contains eu-central-1
- Health check fails (throws in prod, warns in dev) for us-east URLs
- Health check validates ANTHROPIC_BASE_URL is EU

**Implementation:**
1. Create `apps/web/src/lib/region-health.ts`
2. Export `checkRegionCompliance()` that calls `validateAllEndpoints()` from region-config
3. In production: throw on failure. In development: `console.warn`
4. Hook into `apps/web/src/inngest/health-checks.ts` existing health check system
5. Add to Inngest `system/health` function alongside existing LLM/DB checks

**Verify:** `pnpm vitest run region-health`

---

## Task 5: Upgrade geo-detection in exposure route
**Estimate:** 1h
**Eval:** Unit test `geo-detect.test.ts` -- asserts that:
- Request with `x-vercel-ip-country: FR` returns EU=true regardless of email
- Request with no headers but `.fr` email returns EU=true
- Request with `x-vercel-ip-country: US` and `.fr` email returns EU=false (geo-IP wins)
- Request with no headers and `.com` email returns EU=false
- Request with no headers and no email defaults to EU=true in production (safe-by-default)

**Implementation:**
1. Extract `isLikelyEu` from `apps/web/src/app/r/exposure/[id]/route.ts` into `apps/web/src/lib/geo-detect.ts`
2. Refactor to prioritized fallback: geo-header first, email TLD only if no header
3. Add safe-by-default: if no signal at all and `NODE_ENV=production`, treat as EU
4. Remove the "True GDPR compliance" comment from route.ts
5. Update route.ts to import from `geo-detect.ts`
6. Write test at `apps/web/src/__tests__/geo-detect.test.ts`

**Verify:** `pnpm vitest run geo-detect`

---

## Task 6: Create DPA manifest and update privacy page
**Estimate:** 1.5h
**Eval:** Snapshot or structural test `privacy-page.test.tsx` -- asserts that:
- Privacy page renders sub-processor table from DPA manifest
- Table shows correct regions matching actual infra
- Table does NOT say "Supabase" (should say "Neon")
- Each sub-processor has a `dpaStatus` field rendered

**Implementation:**
1. Create `apps/web/src/data/dpas.json` with sub-processor list: Neon (EU), Anthropic (EU), OpenAI (US, no EU endpoint), Apollo (US), Stripe (US, DPF), Google (Global), Resend (US), Vercel (Global)
2. Each entry: `name`, `purpose`, `region`, `dpaStatus` (signed|pending|not-available), `dpaUrl`, `notes`
3. Update `apps/web/src/app/(legal)/privacy/page.tsx`:
   - Import DPA manifest
   - Replace hardcoded `<table>` with dynamic render from manifest
   - Fix "Supabase (PostgreSQL)" to "Neon (PostgreSQL)"
   - Add `dpaStatus` column to table
4. Write test at `apps/web/src/__tests__/privacy-page.test.tsx`

**Verify:** `pnpm vitest run privacy-page`

---

## Task 7: End-to-end region compliance validation
**Estimate:** 1h
**Eval:** Integration test `e2e-region.test.ts` -- asserts that:
- `checkRegionCompliance()` passes against the real env vars in CI
- No file in `apps/web/src` (excluding tests) imports `@ai-sdk/anthropic` directly
- DPA manifest is valid JSON with required fields
- Privacy page text does not contain "Supabase"

**Implementation:**
1. Write comprehensive integration test at `apps/web/src/__tests__/e2e-region.test.ts`
2. Test reads `dpas.json` and validates schema
3. Test greps source tree for direct anthropic imports
4. Test renders privacy page component and checks text content
5. Update `regression.sh` if it exists to include region checks

**Verify:** `pnpm vitest run e2e-region`
