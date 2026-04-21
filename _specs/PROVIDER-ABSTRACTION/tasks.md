# Provider Abstraction — Tasks

Each task has: code change + verify step + test.

## T1. Types + registry scaffolding
- Write `lib/providers/company-enrichment/types.ts` (EnrichedCompany, EnrichInput, ProviderContext, EnrichResult, CompanyEnrichmentProvider).
- Write `lib/providers/company-enrichment/registry.ts` (register/list/reset).
- Verify: `pnpm tsc` clean.
- Test: `__tests__/providers/registry.test.ts` — register, list, reset, priority order.

## T2. Waterfall orchestrator
- Write `lib/providers/company-enrichment/waterfall.ts` — exports `enrichCompany()`.
- Merge rules: first non-null wins, arrays union with dedupe.
- Saturation policy: industry + description + (employeeCount or sizeRange) ⇒ break.
- Verify: tsc clean.
- Test: `__tests__/providers/waterfall.test.ts` — single provider, chain merge, all-fail, saturation early-exit, array union.

## T3. Apollo adapter
- Write `lib/providers/company-enrichment/apollo-adapter.ts` — wraps `enrichOrganization` from `apollo-client.ts`, maps to normalized shape.
- `isAvailable` = `isApolloAvailable()`.
- `costCentsPerCall` = 0 (Apollo is in our plan already).
- Verify: tsc clean.
- Test: `__tests__/providers/apollo-adapter.test.ts` — mock `enrichOrganization` to return payload / null / throw.

## T4. LLM fallback adapter
- Write `lib/providers/company-enrichment/llm-fallback-adapter.ts` — wraps `enrichCompanyViaLLM`.
- `costCentsPerCall` = 2 (Claude Sonnet ~2¢ per enrichment on small prompt).
- `priority` = 100 (last resort).
- Verify: tsc.
- Test: assertions on normalized-shape mapping.

## T5. Default registration
- Write `lib/providers/company-enrichment/register-defaults.ts` — registers apollo + llm-fallback.
- Called lazily from waterfall's `enrichCompany` on first invocation when registry empty.
- Verify: unit test covers lazy register.

## T6. Migrate `/api/enrich`
- Refactor `/api/enrich/route.ts` — replace direct Apollo/LLM calls with `enrichCompany()`.
- Persist provenance to `companies.properties.enrichmentProvenance`.
- Persist cost to `companies.properties.enrichmentCostCents`.
- Verify: tsc clean + manual `curl` smoke.
- Test: extend `__tests__/api-enrich.test.ts` if exists (or add).

## T7. Documentation
- Add short doc `lib/providers/company-enrichment/README.md` with the "add a new provider" recipe.

## Out of scope (future tasks)
- Migrate tam-builder, signal scanners, and Inngest enrichment workers through the waterfall.
- New providers: Clearbit, Hunter, Cognism, BuiltWith.
- Parallel domains: `lib/providers/investor/`, `lib/providers/visitor-id/`.
