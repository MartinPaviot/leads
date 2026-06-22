# RECONCILE.md — Spec 01 Provider Adapter Framework (T0)

> Read-only reconciliation. Verdicts cite `file:line` verified by a 5-finder audit. Heavily brownfield: a working provider registry + several adapters already exist under `app/apps/web/src/lib/providers/`. The spec's "adapter contract" target shape has no external source (no `/spec/steering`), so it is read from the spec text + spec 00's `data-contract.md`.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | `ProviderAdapter<TIn,TOut>` with `toProviderRequest`/`fromProviderResponse`/`capabilities`/`costModel`/`confidenceFor` + registry | **partial** | Registry is complete & good; the port is the non-generic `CompanyEnrichmentProvider`, missing all 5 named members |
| AC2 | 6 shared normalizers | **partial** | Only `title→{seniority,department}` exists; `employees→range` exists but duplicated; country/phone/industry/tech missing or inverse |
| AC3 | One reference adapter (Apollo search), no vendor type leaking past `fromProviderResponse` | **partial** | An Apollo *enrich* adapter normalizes cleanly, but the *search* path has no adapter and leaks raw Apollo types into ~15 callers |
| AC4 | Async capability: `registerWebhook` + `reconcile` | **partial** | Async is real (FullEnrich/Zeliq fire-and-webhook) but ad-hoc, outside the framework; no capability/`registerWebhook`/`reconcile` on any adapter |
| AC5 | Per-adapter rate limiter; core does not manage limits | **missing** | No per-adapter limiter; the only limiter is core-owned inbound HTTP (`rateLimitEnrich`); 429/`Retry-After` ignored |

## AC1 — port + registry — `partial`

- The registry is **already-satisfied**: `registry.ts:14-33` (`registerProvider` dedupe-by-name, `listProviders` priority-sorted, `listAvailableProviders`, `resetRegistryForTest`), wired by `register-defaults.ts:29-41`. Keep it.
- The port is `CompanyEnrichmentProvider` (`providers/company-enrichment/types.ts:84-101`): `name`, `priority`, `isAvailable()`, `costCentsPerCall`, `geoAffinity?`, `enrich(input,ctx)`. It is **not generic** and shares **zero member names** with AC1's set — `toProviderRequest`/`fromProviderResponse`/`capabilities`/`costModel`/`confidenceFor` all absent (grep across `src` = 0 hits). `enrich()` fuses request-shaping + response-mapping; the mapping is inlined at `apollo-adapter.ts:76-99`.
- **Delta:** introduce `ProviderAdapter<TIn,TOut>` (the 5 named members), have the enrichment port implement/extend it, register adapters through it. Registry unchanged beyond typing. **Reuse the registry as-is.**

## AC2 — shared normalizers — `partial`

No `normalizers/` module exists (glob = nothing); each adapter normalizes ad-hoc. Per mapper:
- `title→{seniority,department}` — **present**, reusable: `lib/enrichment/inference.ts:214-243` (`inferSeniorityFromTitle`, `inferDepartmentFromTitle`), tested. **Caveat:** its `Seniority` union differs from the Apollo enum in `lib/contacts/seniority.ts:13-27` — two competing vocabularies; pick one canonical.
- `employees→range` — **present but fragmented**: a shared `employeeCountToRange` is exported from `apollo-client.ts` (imported at `tam/candidate.ts:7-10`), yet the ladder is *also* duplicated inline at `api/tam/route.ts:357-373` and `inngest/campaign-functions.ts:155-166`. Consolidate onto one.
- `country→ISO 3166` — **missing/inverse**: only inverse tables (`voice/twilio.ts:64-77` ISO→name; `region-config.ts:68-80` membership set). No name→ISO.
- `phone→E.164` — **missing**: all phone code consumes already-E.164 input (`contacts/phone-region.ts:93-102`, `voice/number-selector.ts:23-46`); no national→E.164; `libphonenumber-js` earmarked but not wired.
- `industry→NAICS` — **inverse only**: `lib/icp/naics-to-apollo-industry.ts` maps NAICS→Apollo-string, the opposite direction.
- `tech→slug` — **missing**: `techstack-detect.ts:115-140` returns display names, no slugifier.
- **Delta:** create `providers/normalizers/` exporting all six; wrap `inference.ts` (reconciling the seniority vocab), wrap `libphonenumber-js` for E.164, add country/industry/tech maps, extract one `employeesToRange`. **Reuse `inference.ts` + `employeeCountToRange`.**

## AC3 — reference adapter + vendor leak — `partial`

- `company-enrichment/apollo-adapter.ts` wraps the Apollo **enrich** endpoint and maps field-by-field into `Partial<EnrichedCompany>`; the only vendor-typed value kept is `raw` (forensic-only). Good, but it's `enrich`, not `search`, and has no named `fromProviderResponse`.
- The Apollo **search** path (`apollo-client.ts:232-275` `searchOrganizations`/`searchPeople`) has **no adapter** — raw `OrgSearchOrganization`/`ApolloPerson`/`ApolloOrganization` leak directly into ~15 consumers: `tam-builder/handler.ts:1-11,26,40,59`, `tam/candidate.ts:25-43`, `tam-stream/per-company.ts`, `api/tam/route.ts`, `voice/source-prospects.ts`, skills/*.
- **Delta:** add an Apollo **search** adapter with `toProviderRequest`/`fromProviderResponse` producing a neutral shape. **Scope note:** rewiring the ~15 leak sites is **outside this spec's blast radius** (`providers/*` only) — it belongs to the sourcing spec (05). Spec 01 proves the boundary on the new adapter; legacy leaks are documented as a 05 follow-up.

## AC4 — async capability — `partial`

- The port is synchronous-only (`types.ts:84-101`); the waterfall awaits `enrich()` inline (`waterfall.ts:194-207`). No `capabilities`/`registerWebhook`/`reconcile`.
- Async **is** implemented, but ad-hoc and outside the framework: FullEnrich + Zeliq fire-and-webhook clients (`fullenrich-client.ts:1-11,198-203`, `zeliq-client.ts:133-141`), receiver routes (`api/webhooks/{fullenrich,zeliq}/route.ts`), not registered providers. `apollo-client.ts:137-141` documents the unimplemented async phone-reveal webhook the AC names.
- **Delta:** add an optional async `capabilities` + `registerWebhook(ctx)` (generalizing the URL builders) + `reconcile(payload,ctx)` (generalizing the webhook-route DB merge). **Reuse** the existing receiver routes' logic. Expressing FullEnrich/Zeliq as registered async adapters is optional for spec 01 (one reference async capability on Apollo's waterfall suffices for AC4).

## AC5 — per-adapter rate limiter — `missing`

- No per-adapter limiter (grep `rate.?limit|throttle|limiter|backoff|429|Retry-After` across the 15 adapter files = 0). The port has no limiter field.
- The only real limiter, `infra/rate-limit.ts:41-44` (`rateLimitEnrich` 30/min/user), is **core-owned and inbound** — the opposite of AC5. `infra/circuit-breaker.ts:250-256` (`APOLLO_CIRCUIT`) is a breaker, not a limiter; `apollo-client.ts:32-44` ignores 429.
- **Delta:** add an adapter-owned `limiter`/`acquire()` + 429 `Retry-After` parsing in each client; keep the core (waterfall/registry) limiter-agnostic. `infra/retry.ts:retryWithBackoff` exists (unused by adapters) and can back the implementation.

## Reuse inventory (build on these)
- `providers/company-enrichment/registry.ts` — keep as the registry (AC1).
- `lib/enrichment/inference.ts` — title→seniority/department (AC2).
- `employeeCountToRange` (apollo-client) — the canonical employees→range (de-dup the inline copies).
- `apollo-adapter.ts:76-99` mapping — the seed for `fromProviderResponse` (AC3).
- `api/webhooks/{fullenrich,zeliq}` + the callback-URL builders — seed for `registerWebhook`/`reconcile` (AC4).
- `infra/retry.ts` — backoff for the per-adapter limiter (AC5).

## Decisions for the build (taken, per your standing delegation)
1. **Wrap, don't replace.** Add `ProviderAdapter<TIn,TOut>` and make the existing port implement it; the registry + waterfall keep working unchanged.
2. **Reference adapter = Apollo search** (per AC3 wording), new under `providers/apollo/`. The ~15 legacy leak sites are a **spec-05 follow-up** (outside blast radius) — documented, not rewired here.
3. **Canonical seniority vocab = the Apollo enum** (`contacts/seniority.ts`); map `inference.ts` output onto it in the normalizer.
4. **AC4 reference** = Apollo waterfall phone-reveal as the one async capability; FullEnrich/Zeliq registration deferred.

Depends on spec 00 (canonical types). Build starts once #296 is merged.
